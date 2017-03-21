import { EventEmitter } from 'events';
import rightNow from 'right-now';
import WAAClock from 'waaclock';
import { BufferedPV } from './vendor/PhaseVocoder';

import { calculateBPM } from './beatmatching';

import bufferLoader from './waa/buffer-loader';
import resumeContext from './waa/resume-context';

const BUFFER_SIZE = 4096;
const FRAME_SIZE  = 2048;

export default class Track extends EventEmitter {
    constructor(track, context, options = {}) {
        super();

        this.track = track;
        this._context = context;
        this._options = options;

        // Define our Audio nodes
        this._bufferNode = null;
        this._buffer = null;
        this.node = this._context.createGain(); // Pass through the node so the user can use .connect()
        this._pv = new BufferedPV(FRAME_SIZE);

        // Define our public track variables
        this.id = this.track.id;
        this.duration = null;
        this.playing = false;
        this.context = this._context;
        this.canResume = false;
        this.schedules = null;
        this.bpm = null;

        // Define our track variables
        this._connected = false;
        this._audioStartTime = null;
        this._audioPauseTime = null;
        this._audioCurrentTime = 0;

        // Set up WAAClock
        this._clock = new WAAClock(this._context);
        this._clock.start();
        this.clockSchedules = {};

        // Set initial volume
        this.setVolume(this._options.volume);
    }

    /**
     * Load the stream
     * @param  {Boolean} analyze Whether to analyze
     * @return {Promise}         The Promise-wrapped XHR request
     */
    load(analyze = true) {
        if(this.track.type == 'url') {
            return bufferLoader(this._context, this.track.url)
                .then(b => {
                    this._buffer = b;
                    this.duration = b.duration;

                    this.emit('loaded');

                    if(analyze) {
                        return this.analyze()
                            .then(() => {
                                return this;
                            });
                    }

                    return this;
                })
                .catch(err => console.error(err));
        } else {
            // TODO: Buffer files - it's ver easeeey
            throw new Error('File loading is unsupported');
        }
    }

    /**
     * Analyze the track
     * @return {Promise} The Promise-wrapped BPM calculation
     */
    analyze() {
        return calculateBPM(this._context, this._buffer)
            .then(res => {
                this.track.analysed = true;
                this.track.bpm = res.top.tempo;
                this.track.mixoutPosition = res.mixoutPosition;
                this.track.firstPeak = res.firstPeak;
                this.track.intervalActual = res.guesses[0].intervalActual;

                this.emit('analyzed', res);
            });
    }

    /**
     * Schedule upcoming events
     * @todo  Accept parameters like { fadeIn, fadeOut, mix, timestretch }
     */
    _scheduleEvents() {
        console.log({ audioStartTime: this._audioStartTime, audioCurrentTime: this._audioCurrentTime });
        const startTime = this._audioStartTime; // - this._audioCurrentTime - this.track.firstPeak;
        const interval = (this.track.intervalActual / this._context.sampleRate);
        const mixoutPosition = this.track.mixoutPosition;

        // Mixout time
        // When to fade out the track. Scheduling entirely relies on the BPM analysis
        // returning an accurate time of a beat for scheduling everything
        // (it tends to return a time near the end of the song).
        const mixoutTime = startTime + mixoutPosition - this._audioCurrentTime;
        this.node.gain.linearRampToValueAtTime(0.0001, mixoutTime);
        this.stop(mixoutTime + 0.05); // Stop the track just after we mix out
        this.clockSchedules.mixout = this._clock.callbackAtTime(() => {
            this.emit('mixout', mixoutTime);
        }, mixoutTime);

        // Mixin time
        // When to fade in the track. Schedules the start of the crossfade
        // at the Mixout time minus the closest mixLength interval.
        // TODO: Abstract this movement around the track (give a time, get the closest beat)
        let estimatedInPosition = mixoutPosition - this._options.mixLength;
        let mixLengthInterval = 0;
        while((mixoutPosition - mixLengthInterval) - estimatedInPosition > interval) {
            mixLengthInterval += interval;
        }
        const mixinTime = mixoutTime - mixLengthInterval;
        // console.log('Calculated mixin', { mixoutPosition, mixoutTime, estimatedInPosition, mixLengthInterval, interval, mixinTime });
        // TODO: If it's a brand new deck, no fade in
        // TODO: The gainNode may not currently be at 1.0
        this.node.gain.setValueAtTime(1.0, mixinTime);
        this.clockSchedules.mixout = this._clock.callbackAtTime(() => {
            this.emit('mixin', mixinTime);
        }, mixinTime);

        // Time stretching
        // If the previous track has a different BPM, match it and ramp
        // the track back to it's original playback rate over time.
        if(this.bpm && this.track.bpm && this.bpm != this.track.bpm) {
            if(this._bufferNode.playbackRate && this._bufferNode.detune) {
                const playbackRate = this.bpm / this.track.bpm;
                this._bufferNode.playbackRate.value = playbackRate;
                this._bufferNode.playbackRate.setValueAtTime(playbackRate, startTime + this._options.mixLength);
                this._bufferNode.playbackRate.linearRampToValueAtTime(1.0, startTime + this._options.mixLength + this._options.playbackRateTween);

                const detune = 12 * (Math.log(playbackRate) / Math.log(2)) * 100 * (playbackRate < 1 ? -1 : 1);
                this._bufferNode.detune.value = detune;
                this._bufferNode.detune.setValueAtTime(detune, startTime + this._options.mixLength);
                this._bufferNode.detune.exponentialRampToValueAtTime(0.0001, startTime + this._options.mixLength + this._options.playbackRateTween);
            } else {
                // TODO: Cross-browser pitch shifting using PV
            }
        }

        // Define this tracks schedules
        const schedules = {
            bpm: this.track.bpm,
            mixinTime,
            mixoutTime
        };
        this.schedules = schedules;

        // Load next time
        // If we have time to defer loading of the next track. Let's
        // give a generous 60 seconds for loading and analyzing.
        let loadNextTime = 0;
        const duration = this._buffer.duration - this._audioCurrentTime;
        const loadTime = 60 + this._options.mixLength;
        if(duration > loadTime) {
            loadNextTime = this._audioStartTime + duration - loadTime;
        }
        this.clockSchedules.loadNext = this._clock.callbackAtTime(() => {
            this.emit('loadNext', this.schedules);
        }, loadNextTime);
    }

    /**
     * Schedule the mixing of a track
     * @param  {number} time When to play the track
     */
    mixinAt(time) {
        const startTime = time - this.track.firstPeak;
        this.play(startTime);
        this.node.gain.setValueAtTime(0.0001, 0); // 0 to prevent split second blast at the start of a track
        const crossfadeTime = time + (this._options.mixLength / 2);
        this.node.gain.linearRampToValueAtTime(1.0, crossfadeTime);
    }

    /**
     * Play the track
     * @param  {number} when When to play the track
     */
    play(when) {
        const now = this._context.currentTime;
        if(typeof when == 'undefined') {
            when = now;
        }

        const executePlay = () => {
            if(this.playing) {
                return;
            }
            this.playing = true;

            if(this._options.autoResume) {
                resumeContext(this._context);
            }

            // Recreate buffer source
            if(this._bufferNode) {
                this._bufferNode.disconnect();
            }
            this._bufferNode = this._context.createBufferSource();
            this._bufferNode.buffer = this._buffer;
            this._bufferNode.onended = this.ended.bind(this);
            this._bufferNode.connect(this.node);
            this._bufferNode.start(when, this._audioCurrentTime);
            this._audioStartTime = when;

            this._scheduleEvents();
            this.canResume = false;
            this.emit('playing', when);
        };

        if(when <= now) {
            executePlay();
        } else {
            this.clockSchedules.play = this._clock.callbackAtTime(executePlay, when);
        }
    }

    /**
     * Pause the track
     * @param  {number}  when When to pause the track
     * @param  {Boolean} end  Whether to destroy the track
     */
    pause(when, end = false) {
        const now = this._context.currentTime;
        if(typeof when == 'undefined') {
            when = now;
        }

        const executePause = () => {
            if(!this.playing) {
                return;
            }

            this.playing = false;
            if(!end) {
                // Don't let the "end" event get triggered on manual pause.
                this._bufferNode.onended = null;
            }
            this.cancelEvents();

            this._bufferNode.stop(when);

            this._audioPauseTime = when;
            this._audioCurrentTime += (this._audioPauseTime - this._audioStartTime);

            if(!end) {
                this.canResume = true;
                this.emit('paused', when);
            }
        };

        if(when <= now) {
            executePause();
        } else {
            this.clockSchedules.pause = this._clock.callbackAtTime(executePause, when);
        }
    }

    /**
     * Stop the track
     * @param  {number} when When to stop the track
     */
    stop(when) {
        this.pause(when, true);
    }

    /**
     * Cancel upcoming events
     */
    cancelEvents() {
        this.node.gain.cancelScheduledValues(this._context.currentTime);

        Object.keys(this.clockSchedules).forEach(name => {
            this.clockSchedules[name].clear();
        });
    }

    /**
     * Connect the track to an AudioNode
     * @param  {AudioNode} destination
     */
    connect(destination) {
        this.connected = true;
        this.node.connect(destination);
    }

    /**
     * Disconnect the track
     * @todo Disconnect from different connections
     * @see https://developer.mozilla.org/en-US/docs/Web/API/AudioNode/disconnect
     */
    disconnect() {
        this.cancelEvents();

        this.playing = false;
        this.connected = false;
        this.node.disconnect();
    }

    ended() {
        this.destroy();
        this.emit('ended');
    }

    /**
     * Destroy the track
     * Removes the AudioBuffer from memory
     */
    destroy() {
        this.disconnect();

        this._buffer = null;
    }

    /**
     * Current Time
     * @return {number} The current position of the track
     */
    getCurrentTime() {
        if(this.playing) {
            return this._context.currentTime - this._audioStartTime + this._audioCurrentTime;
        }

        return this._audioCurrentTime;
    }

    /**
     * Seek around the track
     * @param  {number} position The position in time to move to
     */
    seek(position) {
        const wasPlaying = this.playing;
        // The track may not be loaded when asked to seek time
        if(this.loaded) {
            this.pause();
        }
        this._audioCurrentTime = position;

        // Only resume from the new time if we were playing before
        if(wasPlaying) {
            this.play();
        }
    }

    /**
     * Manually set the BPM
     * @param {number} bpm
     */
    setBPM(bpm) {
        this.bpm = bpm;
    }

    /**
     * Reset the BPM to the original
     */
    resetBPM() {
        this.setBPM(this.track.bpm);
    }

    /**
     * Get volume
     * @return {number} The current volume of the track
     */
    getVolume() {
        return this.node.gain.value;
    }

    /**
     * Set volume
     * @param {number} value
     */
    setVolume(value) {
        this.node.gain.value = value;
    }
}
