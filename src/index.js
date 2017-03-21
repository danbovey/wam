import { EventEmitter } from 'events';

import AudioContext from './waa/audio-context';
import bufferLoader from './waa/buffer-loader';
import Track from './track';

const defaults = {
    mixLength: 20,
    playbackRateTween: 60,
    volume: 1.0
};

export default class AudioMixer extends EventEmitter {
    constructor(options = {}) {
        super();

        this._options = Object.assign(defaults, options);
        this.context = this._options.context || new AudioContext();

        this.playQueue = [];

        this.tracks = [];
        this._destinations = [];

        this.playing = false;
    }

    play() {
        if(this.playing == false) {
            this.playing = true;

            this._scheduleNext();
        } else {
            this.tracks.forEach(track => {
                if(track.canResume) {
                    track.play();
                }
            });
        }
    }

    pause() {
        this.tracks.forEach(track => {
            track.pause();
        });
    }

    seek(track_id, time) {
        // TODO: Scheduled tracks need to be reset as well
        // Something like tracks.forEach(t => t.cancelIfFuture()) then reschedule the track using track.seek below
        const track = this.tracks.find(t => t.id == track_id);
        if(track) {
            track.seek(time);
        }
    }

    _startTrack(index = 0) {
        const track = this.tracks[index];
        if(track && !track.playing) {
            if(!track.connected) {
                this._destinations.forEach(dest => track.connect(dest));
            }
            track.play();

            // this.emit('play', track);
        }
    }

    _scheduleNext(schedules = null) {
        if(this.tracks.length < 2 && this.playQueue[0]) {
            const track = new Track(this.playQueue[0], this.context, this._options);
            track.on('loaded', () => {
                this._destinations.forEach(dest => track.connect(dest));
                this.emit('loaded', { id: track.id, track: { duration: track.duration }});
            });
            track.on('analyzed', payload => {
                const mixinTime = schedules ? schedules.mixinTime : this.context.currentTime;
                track.mixinAt(mixinTime);
                this.emit('analyzed', { id: track.id, payload });
            });
            track.on('loadNext', sched => {
                // If it exists, force a load of the first item in the queue
                this._scheduleNext(sched);
            });
            track.on('playing', time => this.emit('playing', { id: track.id, time }));
            track.on('paused', time => this.emit('paused', { id: track.id, time }));
            track.on('mixin', time => this.emit('mixin', { id: track.id, time }));
            track.on('mixout', time => this.emit('mixout', { id: track.id, time }));
            track.on('ended', time => {
                // Remove the track from the deck
                const index = this.tracks.findIndex(t => track.id == t.id);
                if(index > -1) {
                    this.tracks.splice(index, 1);
                }
                this.emit('trackEnd', {
                    id: track.id
                });
            });

            // Move from playQueue to tracks
            this.tracks.push(track);
            this.playQueue.splice(0, 1);

            return track.load()
                .then(wamTrack => {
                    // If possible, set the BPM of the next track
                    if(schedules && schedules.bpm) {
                        track.setBPM(schedules.bpm);
                    }
                    console.log(wamTrack.track.mixoutPosition, this.context.currentTime);
                });
        } else {
            console.log('Nothing to schedule / Not scheduling that track yet');
        }
    }

    _trySchedule(track) {
        // If a track needs to be loaded up into the deck
        if(this.tracks.length == 1) {
            console.log('Trying to schedule myself with previous info:', this.tracks[0].schedules);
            this._scheduleNext(this.tracks[0].schedules);
        }
    }

    connect(destination) {
        this._destinations.push(destination);
        this.tracks.forEach(track => {
            track.connect(destination);
        });

        if(!destination instanceof AudioParam) {
            return destination;
        }
    }

    disconnect() {
        this.tracks.forEach(track => {
            track.disconnect();
        });
    }

    /**
     * Add a track to the Play Queue
     * @param {string|File} urlOrFile - URL or file object of audio source
     * @returns {string} Track identifier
     */
    add(urlOrFile) {
        const id = Math.random().toString(36).substr(2, 9);

        const track = {
            id,
            type: urlOrFile instanceof File ? 'file': 'url',
            url: urlOrFile
        };
        this.playQueue.push(track);

        this._trySchedule(track);

        // this.emit('added', track);

        return id;
    }

    /**
     * Remove a track from the Play Queue
     */
    remove(id) {
        const index = this._findIndex(id);
        if(index > -1) {
            this.playQueue.splice(index, 1);

            return true;
        }

        return false;
    }

    _findIndex(id) {
        return this.playQueue.findIndex(t =>  t.id == id);
    }

    _find(id) {
        return this.playQueue.find(t => t.id == id);
    }
}
