import { EventEmitter } from 'events';
import rightNow from 'right-now';
import WAAClock from 'waaclock';
import { BufferedPV } from '../vendor/PhaseVocoder';

import { calculateBPM } from '../beatmatching';

import bufferLoader from './buffer-loader';
import resumeContext from './resume-context';

const BUFFER_SIZE = 4096;
const FRAME_SIZE  = 2048;

const track = (track, context, options = {}) => {
    const emitter = new EventEmitter();

    // Define our Audio nodes
    let bufferNode;
    let buffer;
    const gainNode = context.createGain();
    const pv = new BufferedPV(FRAME_SIZE);

    // Define our track variables
    let duration;
    let audioStartTime = null;
    let audioPauseTime = null;
    let audioCurrentTime = 0;
    let playing = false;
    let connected = false;

    const clock = new WAAClock(context);
    clock.start();
    const clockSchedules = {};

    // Pass through the node so the user can use .connect()
    emitter.node = gainNode;
    emitter.context = context;

    emitter.track = track;
    emitter.id = track.id;
    emitter.canResume = false;
    emitter.schedules = null;
    emitter.bpm = null;

    const ended = () => {
        playing = false;
        audioCurrentTime = 0;

        emitter.emit('ended');
    };

    const destroyBuffer = () => {
        if(bufferNode) {
            bufferNode.disconnect();
        }

        emitter.emit('destroyed');
    };

    emitter.load = (analyze = true) => {
        if(emitter.track.type == 'url') {
            return bufferLoader(context, emitter.track.url)
                .then(b => {
                    buffer = b;
                    duration = buffer.duration;

                    emitter.emit('loaded');

                    if(analyze) {
                        return emitter.analyze()
                            .then(() => {
                                return emitter;
                            });
                    }

                    return emitter;
                })
                .catch(err => console.error(err));
        } else {
            // TODO: Buffer files - it's ver easeeey
            throw new Error('File loading is unsupported');
        }
    };

    emitter.analyze = () => {
        return calculateBPM(context, buffer)
            .then(res => {
                emitter.track.analysed = true;
                emitter.track.bpm = res.top.tempo;
                emitter.track.mixoutPosition = res.mixoutPosition;
                emitter.track.firstPeak = res.firstPeak;
                emitter.track.intervalActual = res.guesses[0].intervalActual;

                emitter.emit('analyzed', res);
            });
    };

    emitter.setBPM = (bpm) => {
        emitter.bpm = bpm;
    };
    emitter.resetBPM = () => {
        emitter.setBPM(emitter.track.bpm);
    };

    // TODO: Accept parameters like { fadeIn, fadeOut, mix, timestretch }
    emitter.scheduleEvents = () => {
        const startTime = audioStartTime - audioCurrentTime - emitter.track.firstPeak;

        // Schedule the start of the crossfade at the mixout time - mixLength interval
        // TODO: The gainNode may not currently be at 1.0
        const mixoutTime = startTime + emitter.track.mixoutPosition;
        const estimatedInPosition = emitter.track.mixoutPosition - options.mixLength;
        const interval = (emitter.track.intervalActual / context.sampleRate);
        let mixLengthInterval = 0;
        while((emitter.track.mixoutPosition - mixLengthInterval) - estimatedInPosition > interval) {
            mixLengthInterval += interval;
        }
        const mixinTime = mixoutTime - mixLengthInterval;

        // console.log('Mixin and Mixout Position', mixinTime, mixoutTime);
        // TODO: If it's a brand new deck, no fade in
        emitter.node.gain.setValueAtTime(1.0, mixinTime);
        clockSchedules.mixout = clock.callbackAtTime(() => {
            emitter.emit('mixin');
        }, mixinTime);

        // Mix out by ending the crossfade at mixoutTime
        emitter.node.gain.linearRampToValueAtTime(0.0001, mixoutTime);
        emitter.stop(mixoutTime + 0.05);
        clockSchedules.mixout = clock.callbackAtTime(() => {
            emitter.emit('mixout', mixoutTime);
        }, mixoutTime);

        // Ramp the track back to it's original playback rate over time
        if(emitter.bpm && emitter.track.bpm && emitter.bpm != emitter.track.bpm) {
            if(bufferNode.playbackRate && bufferNode.detune) {
                const playbackRate = emitter.bpm / emitter.track.bpm;
                // console.log('playbackRate', playbackRate);
                // console.log('playbackRate will be 1.0 at ' + (startTime + options.mixLength + options.playbackRateTween));
                bufferNode.playbackRate.value = startTime + options.mixLength;
                bufferNode.playbackRate.setValueAtTime(playbackRate, startTime + options.mixLength);
                bufferNode.playbackRate.linearRampToValueAtTime(1.0, startTime + options.mixLength + options.playbackRateTween);

                const detune = 12 * (Math.log(playbackRate) / Math.log(2)) * 100 * (playbackRate < 1 ? -1 : 1);
                // console.log('detune', detune);
                // console.log('detune will be 0 at ' + (startTime + options.mixLength + options.playbackRateTween));
                bufferNode.detune.value = startTime + options.mixLength;
                bufferNode.detune.setValueAtTime(detune, startTime + options.mixLength);
                bufferNode.detune.exponentialRampToValueAtTime(0.0001, startTime + options.mixLength + options.playbackRateTween);
            } else {
                // TODO: Cross-browser pitch shifting using PV
            }
        }

        // Define our this tracks schedules
        let loadNextTime = startTime + (emitter.track.mixoutPosition / 2);
        if(loadNextTime > startTime + 30) {
            loadNextTime = startTime + 30;
        }
        const schedules = {
            bpm: emitter.track.bpm,
            mixinTime,
            mixoutTime
        };
        emitter.schedules = schedules;

        // Defer the loading of the next track for a maximum 30 seconds into this track
        clockSchedules.loadNext = clock.callbackAtTime(() => {
            emitter.emit('loadNext', emitter.schedules);
        }, loadNextTime);
    };

    emitter.mixinAt = (mixinTime) => {
        const startTime = mixinTime - emitter.track.firstPeak;
        emitter.play(startTime);
        // console.log('will play at', startTime);
        emitter.node.gain.setValueAtTime(0.0001, startTime - 1); // -1 to prevent split second blast at the start of a track
        const crossfadeTime = mixinTime + (options.mixLength / 2);
        emitter.node.gain.linearRampToValueAtTime(1.0, crossfadeTime);
        // console.log('will ramp to value at', crossfadeTime);
    };

    emitter.cancelEvents = () => {
        emitter.node.gain.cancelScheduledValues(context.currentTime);

        Object.keys(clockSchedules).forEach(name => {
            clockSchedules[name].clear();
        });
    };

    emitter.play = (when) => {
        const now = context.currentTime;
        if(typeof when == 'undefined') {
            when = now;
        }

        const executePlay = () => {
            if(playing) {
                return;
            }
            playing = true;

            if(options.autoResume) {
                resumeContext(emitter.context);
            }

            // Recreate buffer source
            destroyBuffer();
            bufferNode = context.createBufferSource();
            bufferNode.buffer = buffer;
            bufferNode.onended = ended;
            bufferNode.connect(emitter.node);
            bufferNode.start(when, audioCurrentTime);
            audioStartTime = when;

            emitter.scheduleEvents();
            emitter.canResume = false;
            emitter.emit('playing', when);
        };

        if(when <= now) {
            executePlay();
        } else {
            clock.callbackAtTime(executePlay, when);
        }
    };

    emitter.pause = (when = context.currentTime, end = false) => {
        clock.callbackAtTime(() => {
            if(!playing) {
                return;
            }

            playing = false;
            if(!end) {
                // Don't let the "end" event get triggered on manual pause.
                bufferNode.onended = null;
            }
            emitter.cancelEvents();

            bufferNode.stop(when);

            audioPauseTime = when;
            audioCurrentTime += (audioPauseTime - audioStartTime);

            if(end) {
                // ended(); // Should be called by bufferNode.onended
            } else {
                emitter.canResume = true;
                emitter.emit('paused', when);
            }
        }, when);
    };

    emitter.stop = (when) => {
        emitter.pause(when, true);
    };

    emitter.seek = (time) => {
        emitter.pause();
        audioCurrentTime = time;
        emitter.play();
    };

    emitter.destroy = () => {
        destroyBuffer()
        buffer = null;
    };

    emitter.connect = destination => {
        connected = true;
        emitter.node.connect(destination);
    };
    
    /**
     * @todo Disconnect from different connections
     * @see https://developer.mozilla.org/en-US/docs/Web/API/AudioNode/disconnect
     */
    emitter.disconnect = () => {
        connected = false;
        emitter.node.disconnect();
    };

    Object.defineProperties(emitter, {
        currentTime: {
            enumerable: true,
            configurable: true,
            get: () => {
                if(playing) {
                    return context.currentTime - audioStartTime + audioCurrentTime;
                }

                return audioCurrentTime;
            }
        },
        duration: {
            enumerable: true,
            configurable: true,
            get: () => duration
        },
        playing: {
            enumerable: true,
            configurable: true,
            get: () => playing
        },
        buffer: {
            enumerable: true,
            configurable: true,
            get: () => buffer
        },
        volume: {
            enumerable: true,
            configurable: true,
            get: () => gainNode.gain.value,
            set: n => {
                gainNode.gain.value = n;
            }
        }
    });

    // set initial volume
    if(typeof options.volume === 'number') {
        emitter.volume = options.volume;
    }

    return emitter;
};

export default track;
