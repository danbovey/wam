/**
 * Beatmatching module for the Web Audio Mixer!
 * Estimate the BPM using the Web Audio API by analysing an AudioBuffer
 *
 * Orignally designed by Joe Sullivan - http://joesul.li/van
 */

// The sampleSize sets the max amount of parts to process
// 60 would give us 
const sampleSize = 60;

/**
 * Get the analysis peaks for the track
 * 
 * @param {array} channelData - The left and right channel data.
 * @returns {object} `all` peaks throughout the track and the most useful `peaks` for BPM calculation
 */
const getPeaks = (context, channelData) => {
    // Divide up the audio data into parts of 0.5 seconds.
    // Identify what the loudest sample is in each part.
    // We then take the loudest 'sample size' amount of peaks.
    // A larger sample size gives us better accuracy but longer processing times.
    // Taking the loudest allows us to ignore breaks, and work with tracks below 120 BPM.
    let peaks = [];

    const partSize = context.sampleRate / 2; // 0.5 seconds
    const parts = channelData[0].length / partSize; // dividing by 22050 (assuming 44.1kHz sample rate)

    // Loop over the track in parts sized chunks,
    // A 3 minute song would give us 360 parts (assuming 44.1kHz sample rate)
    for(let i = 0; i < parts; i++) {
        let max = 0;
        // Loop over the track in partSize chunks
        for(var j = i * partSize; j < (i + 1) * partSize; j++) {
            // Find the highest volume peak in either channel
            const volume = Math.max(Math.abs(channelData[0][j]), Math.abs(channelData[1][j]));
            if(!max || (volume > max.volume)) {
                max = {
                    position: j,
                    volume: volume
                };
            }
        }
        peaks.push(max);
    }

    // Store all the peaks for scheduling purposes
    const all = peaks;

    // Sort the peaks according to volume
    peaks.sort((a, b) => b.volume - a.volume);
    // Take the loudest 'sample size' amount of those, or all the peaks if less
    peaks = peaks.splice(0, Math.min(sampleSize, peaks.length));
    // Re-sort back into sequential order
    peaks.sort((a, b) => a.position - b.position);

    return {
        all,
        peaks
    };
};

/**
 * Find the distance between peaks to create intervals. Based on that distance,
 * calculate the BPM of each interval. The grouped interval that is seen the
 * most, should represent the track's BPM with some degree of accuracy :)
 *
 * @param {AudioContext} context
 * @param {array} peaks
 * @returns {array} Array of estimations sorted by frequency
 */
const getIntervals = (context, peaks) => {
    const groups = [];

    peaks.forEach((peak, index) => {
        for(var i = 1; (index + i) < peaks.length && i < 10; i++) {
            const tempo = (60 * context.sampleRate) / (peaks[index + i].position - peak.position);
            const group = {
                // Convert an interval to tempo (60 = 60 seconds in a minute)
                tempo,
                count: 1,
                position: peak.position,
                interval: peaks[index + i].position - peak.position,
                allPositions: [peak.position]
            };

            // Adjust the tempo to fit within the 90-180 BPM range
            while(group.tempo < 90) {
                group.tempo *= 2;
            }

            while (group.tempo > 180) {
                group.tempo /= 2;
            }

            group.tempo = Math.round(group.tempo);

            // If the group already exists, add to the count, else push the new group
            if(!(groups.some(interval => {
                if(interval.tempo === group.tempo) {
                    interval.count++;
                    if(interval.allPositions.indexOf(group.position) == -1) {
                        interval.allPositions.push(group.position);
                    }
                }
                return interval.tempo === group.tempo;
            }))) {
                groups.push(group);
            }
        }
    });

    return groups;
};

/**
 * Prepare an AudioBuffer for BPM calculation with filters and then pass to getPeaks & getIntervals
 *
 * @param {AudioContext} context
 * @param {AudioBuffer} buffer - An AudioBuffer that needs it's BPM calculating
 * @returns {Promise} Resolves with the `bpm` of the track within an object, rejects with an <Error>
 */
export const calculateBPM = (context, buffer) => {
    // Place the buffer into a new offline context for processing
    const OfflineContext = window.OfflineAudioContext || window.webkitOfflineAudioContext;

    // TODO: buffer.length is the length of the whole song, so it takes longer to process
    // this should be a shorter sample size of 20-30 seconds, midway through the song
    const offlineContext = new OfflineContext(2, buffer.length, buffer.sampleRate);
    const source = offlineContext.createBufferSource();
    source.buffer = buffer;

    // Lowpass filter to remove most of the melody
    const lowpass = offlineContext.createBiquadFilter();
    lowpass.type = 'lowpass';
    // Filter for beats/kicks around 100 to 150Hz
    lowpass.frequency.value = 150;
    lowpass.Q.value = 1;
    source.connect(lowpass);

    // Highpass filter to remove the bassline
    const highpass = offlineContext.createBiquadFilter();
    highpass.type = 'highpass';
    // Below 100Hz is usually the bassline.
    highpass.frequency.value = 100;
    highpass.Q.value = 1;
    lowpass.connect(highpass);

    highpass.connect(offlineContext.destination);

    source.start(0);
    return new Promise((resolve, reject) => {
        offlineContext.oncomplete = ({ renderedBuffer}) => {
            const peaks = getPeaks(context, [renderedBuffer.getChannelData(0), renderedBuffer.getChannelData(1)]);
            const groups = getIntervals(context, peaks.peaks);

            // For rendering the peak on a timeline, x is the percentage through the track where peak exists
            // x = (100 * peak.position / renderedBuffer.length);

            for(var i in groups) {
                groups[i].intervalActual = context.sampleRate / (groups[i].tempo / 60);
            }

            // Take the top 5 guesses for BPM
            const guesses = groups.sort((a, b) => b.count - a.count).splice(0, 5);

            if(guesses[0]) {
                // For now let's mixin wherever we find the tempo, should be a position near the end of track irl
                const first = peaks.all.sort((a, b) => a.position - b.position)[0];
                const lastPeak = guesses[0].allPositions[guesses[0].allPositions.length - 1];
                const mixoutPosition = lastPeak / context.sampleRate;
                // const firstPeak = first.position / context.sampleRate;

                let firstPeak = guesses[0].allPositions[0] / context.sampleRate;
                // const fp = firstPeak;
                const interval = guesses[0].intervalActual / context.sampleRate;
                // while(firstPeak - interval > 0) {
                //     firstPeak -= interval;
                // }
                firstPeak = mixoutPosition; // Let's try going back from a known "on beat" drum hit!
                while(firstPeak - interval > 0) {
                    firstPeak -= interval;
                }
                firstPeak = firstPeak + 0.01; // 0.01 seems to be the difference in Audacity

                // Top guess is Math.round(guesses[0].tempo) BPM with guesses[0].count samples
                return {
                    bpm: guesses[0].tempo,
                    count: guesses[0].count,
                    top: guesses[0], // TODO: Replace bpm, count with this
                    // others: guesses.slice(1),
                    first,
                    all: peaks.all,
                    mixoutPosition,
                    firstPeak,
                    guesses
                };
            } else {
                throw new Error('No guess');
            }
        };
    });
};
