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
    emitter.loaded = false;
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

                    emitter.loaded = true;
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
        // const startTime = audioStartTime - audioCurrentTime - emitter.track.firstPeak;
        const interval = (emitter.track.intervalActual / context.sampleRate);

        // Mixout time
        // When to fade out the track. Scheduling entirely relies on the BPM analysis
        // returning an accurate time of a beat for scheduling everything
        // (it tends to return a time near the end of the song).
        let mixoutTime = audioStartTime + emitter.track.mixoutPosition - audioCurrentTime;
        if(emitter.track.mixoutPosition < audioCurrentTime) {
            console.log('mixout pos is less than audioCurrentTime');
            // The planned mixout time is earlier than where we are in the
            // track so set the mixout time to the end of the track.
            const estimatedMixoutTime = audioStartTime + buffer.duration - audioCurrentTime;
            let mixoutMovement = 0;
            while((emitter.track.mixoutPosition + mixoutMovement) - estimatedMixoutTime > interval) {
                mixoutMovement += interval;
            }
            mixoutTime = estimatedMixoutTime + mixoutMovement; // Currently a beat after the song ends?
        }
        emitter.node.gain.linearRampToValueAtTime(0.0001, mixoutTime);
        emitter.stop(mixoutTime + 0.05); // Stop the track just after we mix out
        clockSchedules.mixout = clock.callbackAtTime(() => {
            emitter.emit('mixout', mixoutTime);
        }, mixoutTime);

        // Mixin time
        // When to fade in the track. Schedules the start of the crossfade
        // at the Mixout time minus the closest mixLength interval.
        // TODO: Abstract this movement around the track (give a time, get the closest beat)
        let mixinTime = mixoutTime - options.mixLength;
        const mixinPosition = mixinTime - audioStartTime;
        if(mixinPosition < audioCurrentTime) {
            // The planned mixin time is earlier than where we are in the track so mixin ASAP.
            if(options.debug) {
                console.groupCollapsed('wam - ' + emitter.id + ' Mixin calculation');
                console.log({ mixinPosition, audioStartTime, audioCurrentTime });
                console.groupEnd();
            }
            let mixinMovement = 0;
            if(buffer.duration - audioCurrentTime < 60) { // 60 seconds to loadNext
                mixinTime = mixoutTime;
            } else {
                // We know we have 60 seconds to play with
                console.log((audioCurrentTime + 30), mixinPosition);
                while((audioCurrentTime + 30) - (mixinPosition + mixinMovement) > interval) {
                    mixinMovement += interval;
                }
                mixinTime = (audioCurrentTime + 30) - mixinMovement;
            }
        } else {
            let mixinMovement = 0;
            while((emitter.track.mixoutPosition - mixinMovement) - mixinPosition > interval) {
                mixinMovement += interval;
            }
            mixinTime = mixoutTime - mixinMovement;
        }
        // TODO: If it's a brand new deck, no fade in
        // TODO: The gainNode may not currently be at 1.0
        emitter.node.gain.setValueAtTime(1.0, mixinTime);
        clockSchedules.mixout = clock.callbackAtTime(() => {
            emitter.emit('mixin');
        }, mixinTime);

        // Time stretching
        // If the previous track has a different BPM, match it and ramp
        // the track back to it's original playback rate over time.
        if(emitter.bpm && emitter.track.bpm && emitter.bpm != emitter.track.bpm) {
            if(bufferNode.playbackRate && bufferNode.detune) {
                const playbackRate = emitter.bpm / emitter.track.bpm;
                bufferNode.playbackRate.value = audioStartTime + options.mixLength;
                bufferNode.playbackRate.setValueAtTime(playbackRate, audioStartTime + options.mixLength);
                bufferNode.playbackRate.linearRampToValueAtTime(1.0, audioStartTime + options.mixLength + options.playbackRateTween);

                const detune = 12 * (Math.log(playbackRate) / Math.log(2)) * 100 * (playbackRate < 1 ? -1 : 1);
                bufferNode.detune.value = audioStartTime + options.mixLength;
                bufferNode.detune.setValueAtTime(detune, audioStartTime + options.mixLength);
                bufferNode.detune.exponentialRampToValueAtTime(0.0001, audioStartTime + options.mixLength + options.playbackRateTween);
            } else {
                // TODO: Cross-browser pitch shifting using PV
            }
        }

        // Define our this tracks schedules
        const schedules = {
            id: emitter.id,
            bpm: emitter.track.bpm,
            mixinTime,
            mixoutTime
        };
        emitter.schedules = schedules;

        if(options.debug) {
            console.groupCollapsed('wam - ' + emitter.id + ' Schedules');
            console.log(schedules);
            console.groupEnd();
        }

        // Load the next track
        let loadNextTime = 0;
        // If we have time to defer loading of the next track
        // Let's give a generous 60 seconds for loading and analyzing
        if((buffer.duration - audioCurrentTime) > (60 + options.mixLength)) {
            loadNextTime = audioStartTime + (buffer.duration - audioCurrentTime) - (60 + options.mixLength);
        }
        console.log('loadNextTime', loadNextTime, context.currentTime);
        if(loadNextTime > context.currentTime) {
            clockSchedules.loadNext = clock.callbackAtTime(() => {
                emitter.emit('loadNext', emitter.schedules);
            }, loadNextTime);
        } else {
            emitter.emit('loadNext', emitter.schedules);
        }
    };

    emitter.mixinAt = (mixinTime) => {
        const startTime = mixinTime - emitter.track.firstPeak;
        emitter.play(startTime);
        emitter.node.gain.setValueAtTime(0.0001, startTime - 1); // -1 to prevent split second blast at the start of a track
        const crossfadeTime = mixinTime + (options.mixLength / 2);
        emitter.node.gain.linearRampToValueAtTime(1.0, crossfadeTime);
    };

    emitter.cancelEvents = (when) => {
        emitter.node.gain.cancelScheduledValues(when);
        if(bufferNode.playbackRate && bufferNode.detune) {
            bufferNode.playbackRate.cancelScheduledValues(when);
            bufferNode.detune.cancelScheduledValues(when);
        }

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
            console.log('starting bufferNode at ' + audioCurrentTime);
            bufferNode.start(when, audioCurrentTime);
            audioStartTime = when;

            emitter.scheduleEvents();
            emitter.canResume = false;
            emitter.emit('playing', when);
        };

        if(when <= now) {
            executePlay();
        } else {
            clockSchedules.play = clock.callbackAtTime(() => executePlay, when);
        }
    };

    emitter.pause = (when = context.currentTime, end = false) => {
        clockSchedules.pause = clock.callbackAtTime(() => {
            if(!playing) {
                return;
            }

            playing = false;
            if(!end) {
                // Don't let the "end" event get triggered on manual pause.
                bufferNode.onended = null;
            }
            emitter.cancelEvents(when);

            console.log('stopping bufferNode at ' + when);
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
        const wasPlaying = playing;
        // The track may not be loaded when asked to seek time
        console.log('seeking track to ' + time + ' - it was ' + (!wasPlaying ? 'not ' : '') + 'playing');
        if(emitter.loaded) {
            emitter.pause();
        }
        audioCurrentTime = time;

        // Only resume from the new time if we were playing before
        if(wasPlaying) {
            emitter.play();
        }
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
