![Logo](http://i.imgur.com/6eCkyNM.png)

Web Audio Mixer
========

[![npm](https://img.shields.io/npm/v/webaudiomixer.svg)](https://www.npmjs.com/package/webaudiomixer)

> 🎛 Automatic track mixing using the Web Audio API

**For a demo, please visit [wam.dj](https://wam.dj). Click "Try the Demo" or Sign up, connect with SoundCloud and set up a play queue of your own songs!**

The library uses [Joe Sullivan's idea and algorithm](http://joesul.li/van/beat-detection-using-web-audio/) for detecting beats using the Web Audio API. It uses [WAAClock](https://github.com/sebpiq/WAAClock) (which is based on an article by Chris Wilson - [A Tale of Two Clocks](https://www.html5rocks.com/en/tutorials/audio/scheduling/)) to schedule events based on the times calculated from the beat detection. If we know the BPM and a point in time when a drum hits, we can move to any beat in a track, or schedule another track to start on a beat.

The above idea aligns the beats of two tracks, but to properly mix, they need to play at the same tempo. Using the `playbackRate` and `detune` methods, the library time stretches the new track to match the current track. Currently, this is not a cross-browser solution, so I plan on using a Javascript implementation like [PhaseVocoderJS](https://github.com/echo66/PhaseVocoderJS) to polyfill this behaviour.

## Install

```
npm i webaudiomixer --save
```

## Usage

```js
import WebAudioMixer from 'webaudiomixer';

const context = new AudioContext();
const mixer = new WebAudioMixer({
    context
});
// Connect the mixer to the output
mixer.connect(context.destination);
```

#### Creating a play queue

You can add tracks to the play queue with a URL to an audio source. The `add` method returns a unique ID which you can assign back to the track in your application. Any events or references to the track will use that ID.

**Add a track to the play queue**

```js
const id = mixer.add(stream_url);
```

**Start the queue**

```js
mixer.play();
```

**Pause all tracks**

```js
mixer.pause();
```

**Remove a track from the play queue**

```js
const removed = mixer.remove(id);
```

**Seek to a time in the track (in seconds)**

```js
mixer.seek(id, time);
```

**Disconnect the AudioNode**

```js
mixer.disconnect();
```

⚠️ TODO: Removing/replacing a track once it's started, loaded or scheduled.

#### Events

You can listen for events to update the UI of your application. The events are emitted in the tolerance zone (0.10s) of the event happening in the Web Audio clock. If you need greater precision, schedule things using the times from the `analyzed` payload, or access information in `mixer.tracks` directly.

| Event    | Payload           | Description                                         |
|----------|-------------------|-----------------------------------------------------|
| analyzed | `{ id, payload }` | Track has been analyzed by the beat matching module |
| loaded   | `{ id, track }`   | Track has been loaded into an `AudioBuffer`         |
| mixin    | `{ id, time }`    | Track is being mixed in at `time`                   |
| mixout   | `{ id, time }`    | Track has been mixed out at `time`                  |
| playing  | `{ id, time }`    | Track will begin playing at `time`                  |
| paused   | `{ id, time }`    | Track will be paused at `time`                      |
| trackEnd | `{ id }`          | Track is stopped and destroyed                      |

⚠️ TODO: Helper method to find a track by ID, so that you can access the `AudioBuffer`, and other real-time information.

#### Options

| Option            | Default            | Description                                                                  |
|-------------------|--------------------|------------------------------------------------------------------------------|
| context           | new AudioContext() | I recommend passing in an `AudioContext` from your app                       |
| maxBpmDiff        | 8                  | Maximum BPM difference between two tracks for the playbackRate to be changed |
| mixLength         | 20                 | Time in seconds a track should crossfade and mix for                         |
| playbackRateTween | 60                 | Time in seconds a track should ramp back to it's original playbackRate       |
| volume            | 1.0                | Initial value of the gainNode                                                |

## Final Year Project

This library was developed as a part of my Final Year Project for Web Development BSc at Staffordshire University. My report was titled *Automatic track mixing using the Web Audio API* and it researched the possibilities of using the Web Audio API to improving the experience of streaming music online.
