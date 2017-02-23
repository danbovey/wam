var CBuffer;

(function (global) {

CBuffer = function() {
    // handle cases where "new" keyword wasn't used
    if (!(this instanceof CBuffer)) {
        // multiple conditions need to be checked to properly emulate Array
        if (arguments.length > 1 || typeof arguments[0] !== 'number') {
            return CBuffer.apply(new CBuffer(arguments.length), arguments);
        } else {
            return new CBuffer(arguments[0]);
        }
    }
    // if no arguments, then nothing needs to be set
    if (arguments.length === 0)
    throw new Error('Missing Argument: You must pass a valid buffer length');
    // this is the same in either scenario
    this.size = this.start = 0;
    // set to callback fn if data is about to be overwritten
    this.overflow = null;
    // emulate Array based on passed arguments
    if (arguments.length > 1 || typeof arguments[0] !== 'number') {
        this.data = new Float32Array(arguments.length);
        this.end = (this.length = arguments.length) - 1;
        this.push.apply(this, arguments);
    } else {
        this.data = new Float32Array(arguments[0]);
        this.end = (this.length = arguments[0]) - 1;
    }
    // need to `return this` so `return CBuffer.apply` works
    return this;
}

function defaultComparitor(a, b) {
    return a == b ? 0 : a > b ? 1 : -1;
}

CBuffer.prototype = {
    // properly set constructor
    constructor : CBuffer,

    /* mutator methods */
    // pop last item
    pop : function () {
        var item;
        if (this.size === 0) return;
        item = this.data[this.end];
        // remove the reference to the object so it can be garbage collected
        delete this.data[this.end];
        this.end = (this.end - 1 + this.length) % this.length;
        this.size--;
        return item;
    },
    // push item to the end
    push : function () {
        var i = 0;
        // check if overflow is set, and if data is about to be overwritten
        if (this.overflow && this.size + arguments.length > this.length) {
            // call overflow function and send data that's about to be overwritten
            for (; i < this.size + arguments.length - this.length; i++) {
                this.overflow(this.data[(this.end + i + 1) % this.length], this);
            }
        }
        // push items to the end, wrapping and erasing existing items
        // using arguments variable directly to reduce gc footprint
        for (i = 0; i < arguments.length; i++) {
            this.data[(this.end + i + 1) % this.length] = arguments[i];
        }
        // recalculate size
        if (this.size < this.length) {
            if (this.size + i > this.length) this.size = this.length;
            else this.size += i;
        }
        // recalculate end
        this.end = (this.end + i) % this.length;
        // recalculate start
        this.start = (this.length + this.end - this.size + 1) % this.length;
        // return number current number of items in CBuffer
        return this.size;
    },
    // reverse order of the buffer
    reverse : function () {
        var i = 0,
            tmp;
        for (; i < ~~(this.size / 2); i++) {
            tmp = this.data[(this.start + i) % this.length];
            this.data[(this.start + i) % this.length] = this.data[(this.start + (this.size - i - 1)) % this.length];
            this.data[(this.start + (this.size - i - 1)) % this.length] = tmp;
        }
        return this;
    },
    // rotate buffer to the left by cntr, or by 1
    rotateLeft : function (cntr) {
        if (typeof cntr === 'undefined') cntr = 1;
        if (typeof cntr !== 'number') throw new Error("Argument must be a number");
        while (--cntr >= 0) {
            this.push(this.shift());
        }
        return this;
    },
    // rotate buffer to the right by cntr, or by 1
    rotateRight : function (cntr) {
        if (typeof cntr === 'undefined') cntr = 1;
        if (typeof cntr !== 'number') throw new Error("Argument must be a number");
        while (--cntr >= 0) {
            this.unshift(this.pop());
        }
        return this;
    },
    // remove and return first item
    shift : function () {
        var item;
        // check if there are any items in CBuff
        if (this.size === 0) return;
        // store first item for return
        item = this.data[this.start];
        // recalculate start of CBuffer
        this.start = (this.start + 1) % this.length;
        // decrement size
        this.size--;
        return item;
    },
    // sort items
    sort : function (fn) {
        // this.data.sort(fn || defaultComparitor);
        // this.start = 0;
        // this.end = this.size - 1;
        return this;
    },
    // add item to beginning of buffer
    unshift : function () {
        var i = 0;
        // check if overflow is set, and if data is about to be overwritten
        if (this.overflow && this.size + arguments.length > this.length) {
            // call overflow function and send data that's about to be overwritten
            for (; i < this.size + arguments.length - this.length; i++) {
                this.overflow(this.data[this.end - (i % this.length)], this);
            }
        }
        for (i = 0; i < arguments.length; i++) {
            this.data[(this.length + this.start - (i % this.length) - 1) % this.length] = arguments[i];
        }
        if (this.length - this.size - i < 0) {
            this.end += this.length - this.size - i;
            if (this.end < 0) this.end = this.length + (this.end % this.length);
        }
        if (this.size < this.length) {
            if (this.size + i > this.length) this.size = this.length;
            else this.size += i;
        }
        this.start -= arguments.length;
        if (this.start < 0) this.start = this.length + (this.start % this.length);
        return this.size;
    },

    /* accessor methods */
    // return index of first matched element
    indexOf : function (arg, idx) {
        if (!idx) idx = 0;
        for (; idx < this.size; idx++) {
            if (this.data[(this.start + idx) % this.length] === arg) return idx;
        }
        return -1;
    },
    // return last index of the first match
    lastIndexOf : function (arg, idx) {
        if (!idx) idx = this.size - 1;
        for (; idx >= 0; idx--) {
            if (this.data[(this.start + idx) % this.length] === arg) return idx;
        }
        return -1;
    },

    // return the index an item would be inserted to if this
    // is a sorted circular buffer
    sortedIndex : function(value, comparitor, context) {
        comparitor = comparitor || defaultComparitor;
        var low = this.start,
            high = this.size - 1;

        // Tricky part is finding if its before or after the pivot
        // we can get this info by checking if the target is less than
        // the last item. After that it's just a typical binary search.
        if (low && comparitor.call(context, value, this.data[high]) > 0) {
            low = 0, high = this.end;
        }

        while (low < high) {
          var mid = (low + high) >>> 1;
          if (comparitor.call(context, value, this.data[mid]) > 0) low = mid + 1;
          else high = mid;
        }
        // http://stackoverflow.com/a/18618273/1517919
        return (((low - this.start) % this.size) + this.size) % this.size;
    },

    /* iteration methods */
    // check every item in the array against a test
    every : function (callback, context) {
        var i = 0;
        for (; i < this.size; i++) {
            if (!callback.call(context, this.data[(this.start + i) % this.length], i, this))
                return false;
        }
        return true;
    },
    // loop through each item in buffer
    // TODO: figure out how to emulate Array use better
    forEach : function (callback, context) {
        var i = 0;
        for (; i < this.size; i++) {
            callback.call(context, this.data[(this.start + i) % this.length], i, this);
        }
    },
    // check items agains test until one returns true
    // TODO: figure out how to emuldate Array use better
    some : function (callback, context) {
        var i = 0;
        for (; i < this.size; i++) {
            if (callback.call(context, this.data[(this.start + i) % this.length], i, this))
                return true;
        }
        return false;
    },
    // calculate the average value of a circular buffer
    avg : function () {
        return this.size == 0 ? 0 : (this.sum() / this.size);
    },
    // loop through each item in buffer and calculate sum
    sum : function () {
        var index = this.size;
        var s = 0;
        while (index--) s += this.data[index];
        return s;
    },
    // loop through each item in buffer and calculate median
    median : function () {
        if (this.size === 0)
            return 0;
        var values = this.slice().sort(defaultComparitor);
        var half = Math.floor(values.length / 2);
        if(values.length % 2)
            return values[half];
        else
            return (values[half-1] + values[half]) / 2.0;
    },
    /* utility methods */
    // reset pointers to buffer with zero items
    // note: this will not remove values in cbuffer, so if for security values
    //       need to be overwritten, run `.fill(null).empty()`
    empty : function () {
        var i = 0;
        this.size = this.start = 0;
        this.end = this.length - 1;
        return this;
    },
    // fill all places with passed value or function
    fill : function (arg) {
        var i = 0;
        if (typeof arg === 'function') {
            while(this.data[i] = arg(), ++i < this.length);
        } else {
            while(this.data[i] = arg, ++i < this.length);
        }
        // reposition start/end
        this.start = 0;
        this.end = this.length - 1;
        this.size = this.length;
        return this;
    },
    // return first item in buffer
    first : function () {
        return this.data[this.start];
    },
    // return last item in buffer
    last : function () {
        return this.data[this.end];
    },
    // return specific index in buffer
    get : function (arg) {
        return this.data[(this.start + arg) % this.length];
    },
    isFull : function (arg) {
        return this.length === this.size;
    },
    // set value at specified index
    set : function (idx, arg) {
        return this.data[(this.start + idx) % this.length] = arg;
    },
    // return clean array of values
    toArray : function () {
        return this.slice();
    },
    // slice the buffer to an arraay
    slice : function (start, end) {
        var length = this.size;

        start = +start || 0;

        if (start < 0) {
            if (start >= end)
                return [];
            start = (-start > length) ? 0 : length + start;
        }

        if (end == null || end > length)
            end = length;
        else if (end < 0)
            end += length;
        else
            end = +end || 0;

        length = start < end ? end - start : 0;

        var result = Array(length);
        for (var index = 0; index < length; index++) {
            result[index] = this.data[(this.start + start + index) % this.length];
        }
        return result;
    }
};

}(this));

var FFT;

(function(global) {

    /* 
     *  DSP.js - a comprehensive digital signal processing  library for javascript
     * 
     *  Created by Corban Brook <corbanbrook@gmail.com> on 2010-01-01.
     *  Copyright 2010 Corban Brook. All rights reserved.
     *
     */

    ////////////////////////////////////////////////////////////////////////////////
    //                                  CONSTANTS                                 //
    ////////////////////////////////////////////////////////////////////////////////

    /**
     * DSP is an object which contains general purpose utility functions and constants
     */
    var DSP = {
      // Channels
      LEFT:           0,
      RIGHT:          1,
      MIX:            2,

      // Waveforms
      SINE:           1,
      TRIANGLE:       2,
      SAW:            3,
      SQUARE:         4,

      // Filters
      LOWPASS:        0,
      HIGHPASS:       1,
      BANDPASS:       2,
      NOTCH:          3,

      // Window functions
      BARTLETT:       1,
      BARTLETTHANN:   2,
      BLACKMAN:       3,
      COSINE:         4,
      GAUSS:          5,
      HAMMING:        6,
      HANN:           7,
      LANCZOS:        8,
      RECTANGULAR:    9,
      TRIANGULAR:     10,

      // Loop modes
      OFF:            0,
      FW:             1,
      BW:             2,
      FWBW:           3,

      // Math
      TWO_PI:         2*Math.PI
    };

    // // Setup arrays for platforms which do not support byte arrays
    // function setupTypedArray(name, fallback) {
    //   // check if TypedArray exists
    //   // typeof on Minefield and Chrome return function, typeof on Webkit returns object.
    //   if (typeof this[name] !== "function" && typeof this[name] !== "object") {
    //     // nope.. check if WebGLArray exists
    //     if (typeof this[fallback] === "function" && typeof this[fallback] !== "object") {
    //       this[name] = this[fallback];
    //     } else {
    //       // nope.. set as Native JS array
    //       this[name] = function(obj) {
    //         if (obj instanceof Array) {
    //           return obj;
    //         } else if (typeof obj === "number") {
    //           return new Array(obj);
    //         }
    //       };
    //     }
    //   }
    // }

    // setupTypedArray("Float32Array", "WebGLFloatArray");
    // setupTypedArray("Int32Array",   "WebGLIntArray");
    // setupTypedArray("Uint16Array",  "WebGLUnsignedShortArray");
    // setupTypedArray("Uint8Array",   "WebGLUnsignedByteArray");


    ////////////////////////////////////////////////////////////////////////////////
    //                            DSP UTILITY FUNCTIONS                           //
    ////////////////////////////////////////////////////////////////////////////////

    /**
     * Inverts the phase of a signal
     *
     * @param {Array} buffer A sample buffer
     *
     * @returns The inverted sample buffer
     */
    DSP.invert = function(buffer) {
      for (var i = 0, len = buffer.length; i < len; i++) {
        buffer[i] *= -1;
      }

      return buffer;
    };

    /**
     * Converts split-stereo (dual mono) sample buffers into a stereo interleaved sample buffer
     *
     * @param {Array} left  A sample buffer
     * @param {Array} right A sample buffer
     *
     * @returns The stereo interleaved buffer
     */
    DSP.interleave = function(left, right) {
      if (left.length !== right.length) {
        throw "Can not interleave. Channel lengths differ.";
      }
     
      var stereoInterleaved = new Float32Array(left.length * 2);
     
      for (var i = 0, len = left.length; i < len; i++) {
        stereoInterleaved[2*i]   = left[i];
        stereoInterleaved[2*i+1] = right[i];
      }
     
      return stereoInterleaved;
    };

    /**
     * Converts a stereo-interleaved sample buffer into split-stereo (dual mono) sample buffers
     *
     * @param {Array} buffer A stereo-interleaved sample buffer
     *
     * @returns an Array containing left and right channels
     */
    DSP.deinterleave = (function() {
      var left, right, mix, deinterleaveChannel = []; 

      deinterleaveChannel[DSP.MIX] = function(buffer) {
        for (var i = 0, len = buffer.length/2; i < len; i++) {
          mix[i] = (buffer[2*i] + buffer[2*i+1]) / 2;
        }
        return mix;
      };

      deinterleaveChannel[DSP.LEFT] = function(buffer) {
        for (var i = 0, len = buffer.length/2; i < len; i++) {
          left[i]  = buffer[2*i];
        }
        return left;
      };

      deinterleaveChannel[DSP.RIGHT] = function(buffer) {
        for (var i = 0, len = buffer.length/2; i < len; i++) {
          right[i]  = buffer[2*i+1];
        }
        return right;
      };

      return function(channel, buffer) { 
        left  = left  || new Float32Array(buffer.length/2);
        right = right || new Float32Array(buffer.length/2);
        mix   = mix   || new Float32Array(buffer.length/2);

        if (buffer.length/2 !== left.length) {
          left  = new Float32Array(buffer.length/2);
          right = new Float32Array(buffer.length/2);
          mix   = new Float32Array(buffer.length/2);
        }

        return deinterleaveChannel[channel](buffer);
      };
    }());

    /**
     * Separates a channel from a stereo-interleaved sample buffer
     *
     * @param {Array}  buffer A stereo-interleaved sample buffer
     * @param {Number} channel A channel constant (LEFT, RIGHT, MIX)
     *
     * @returns an Array containing a signal mono sample buffer
     */
    DSP.getChannel = DSP.deinterleave;

    /**
     * Helper method (for Reverb) to mix two (interleaved) samplebuffers. It's possible
     * to negate the second buffer while mixing and to perform a volume correction
     * on the final signal.
     *
     * @param {Array} sampleBuffer1 Array containing Float values or a Float32Array
     * @param {Array} sampleBuffer2 Array containing Float values or a Float32Array
     * @param {Boolean} negate When true inverts/flips the audio signal
     * @param {Number} volumeCorrection When you add multiple sample buffers, use this to tame your signal ;)
     *
     * @returns A new Float32Array interleaved buffer.
     */
    DSP.mixSampleBuffers = function(sampleBuffer1, sampleBuffer2, negate, volumeCorrection){
      var outputSamples = new Float32Array(sampleBuffer1);

      for(var i = 0; i<sampleBuffer1.length; i++){
        outputSamples[i] += (negate ? -sampleBuffer2[i] : sampleBuffer2[i]) / volumeCorrection;
      }
     
      return outputSamples;
    }; 

    // Biquad filter types
    DSP.LPF = 0;                // H(s) = 1 / (s^2 + s/Q + 1)
    DSP.HPF = 1;                // H(s) = s^2 / (s^2 + s/Q + 1)
    DSP.BPF_CONSTANT_SKIRT = 2; // H(s) = s / (s^2 + s/Q + 1)  (constant skirt gain, peak gain = Q)
    DSP.BPF_CONSTANT_PEAK = 3;  // H(s) = (s/Q) / (s^2 + s/Q + 1)      (constant 0 dB peak gain)
    DSP.NOTCH = 4;              // H(s) = (s^2 + 1) / (s^2 + s/Q + 1)
    DSP.APF = 5;                // H(s) = (s^2 - s/Q + 1) / (s^2 + s/Q + 1)
    DSP.PEAKING_EQ = 6;         // H(s) = (s^2 + s*(A/Q) + 1) / (s^2 + s/(A*Q) + 1)
    DSP.LOW_SHELF = 7;          // H(s) = A * (s^2 + (sqrt(A)/Q)*s + A)/(A*s^2 + (sqrt(A)/Q)*s + 1)
    DSP.HIGH_SHELF = 8;         // H(s) = A * (A*s^2 + (sqrt(A)/Q)*s + 1)/(s^2 + (sqrt(A)/Q)*s + A)

    // Biquad filter parameter types
    DSP.Q = 1;
    DSP.BW = 2; // SHARED with BACKWARDS LOOP MODE
    DSP.S = 3;

    // Find RMS of signal
    DSP.RMS = function(buffer) {
      var total = 0;
      
      for (var i = 0, n = buffer.length; i < n; i++) {
        total += buffer[i] * buffer[i];
      }
      
      return Math.sqrt(total / n);
    };

    // Find Peak of signal
    DSP.Peak = function(buffer) {
      var peak = 0;
      
      for (var i = 0, n = buffer.length; i < n; i++) {
        peak = (Math.abs(buffer[i]) > peak) ? Math.abs(buffer[i]) : peak; 
      }
      
      return peak;
    };

    // Fourier Transform Module used by DFT, FFT, RFFT
    function FourierTransform(bufferSize, sampleRate) {
      this.bufferSize = bufferSize;
      this.sampleRate = sampleRate;
      this.bandwidth  = 2 / bufferSize * sampleRate / 2;

      this.spectrum   = new Float32Array(bufferSize/2);
      this.real       = new Float32Array(bufferSize);
      this.imag       = new Float32Array(bufferSize);

      this.peakBand   = 0;
      this.peak       = 0;

      /**
       * Calculates the *middle* frequency of an FFT band.
       *
       * @param {Number} index The index of the FFT band.
       *
       * @returns The middle frequency in Hz.
       */
      this.getBandFrequency = function(index) {
        return this.bandwidth * index + this.bandwidth / 2;
      };

      this.calculateSpectrum = function() {
        var spectrum  = this.spectrum,
            real      = this.real,
            imag      = this.imag,
            bSi       = 2 / this.bufferSize,
            sqrt      = Math.sqrt,
            rval, 
            ival,
            mag;

        for (var i = 0, N = bufferSize/2; i < N; i++) {
          rval = real[i];
          ival = imag[i];
          mag = bSi * sqrt(rval * rval + ival * ival);

          if (mag > this.peak) {
            this.peakBand = i;
            this.peak = mag;
          }

          spectrum[i] = mag;
        }
      };
    }

    /**
     * DFT is a class for calculating the Discrete Fourier Transform of a signal.
     *
     * @param {Number} bufferSize The size of the sample buffer to be computed
     * @param {Number} sampleRate The sampleRate of the buffer (eg. 44100)
     *
     * @constructor
     */
    function DFT(bufferSize, sampleRate) {
      FourierTransform.call(this, bufferSize, sampleRate);

      var N = bufferSize/2 * bufferSize;
      var TWO_PI = 2 * Math.PI;

      this.sinTable = new Float32Array(N);
      this.cosTable = new Float32Array(N);

      for (var i = 0; i < N; i++) {
        this.sinTable[i] = Math.sin(i * TWO_PI / bufferSize);
        this.cosTable[i] = Math.cos(i * TWO_PI / bufferSize);
      }
    }

    /**
     * Performs a forward transform on the sample buffer.
     * Converts a time domain signal to frequency domain spectra.
     *
     * @param {Array} buffer The sample buffer
     *
     * @returns The frequency spectrum array
     */
    DFT.prototype.forward = function(buffer) {
      var real = this.real, 
          imag = this.imag,
          rval,
          ival;

      for (var k = 0; k < this.bufferSize/2; k++) {
        rval = 0.0;
        ival = 0.0;

        for (var n = 0; n < buffer.length; n++) {
          rval += this.cosTable[k*n] * buffer[n];
          ival += this.sinTable[k*n] * buffer[n];
        }

        real[k] = rval;
        imag[k] = ival;
      }

      return this.calculateSpectrum();
    };


    /**
     * FFT is a class for calculating the Discrete Fourier Transform of a signal
     * with the Fast Fourier Transform algorithm.
     *
     * @param {Number} bufferSize The size of the sample buffer to be computed. Must be power of 2
     * @param {Number} sampleRate The sampleRate of the buffer (eg. 44100)
     *
     * @constructor
     */
    FFT = function(bufferSize, sampleRate) {
      FourierTransform.call(this, bufferSize, sampleRate);
       
      this.reverseTable = new Uint32Array(bufferSize);

      var limit = 1;
      var bit = bufferSize >> 1;

      var i;

      while (limit < bufferSize) {
        for (i = 0; i < limit; i++) {
          this.reverseTable[i + limit] = this.reverseTable[i] + bit;
        }

        limit = limit << 1;
        bit = bit >> 1;
      }

      this.sinTable = new Float32Array(bufferSize);
      this.cosTable = new Float32Array(bufferSize);

      for (i = 0; i < bufferSize; i++) {
        this.sinTable[i] = Math.sin(-Math.PI/i);
        this.cosTable[i] = Math.cos(-Math.PI/i);
      }
    }

    /**
     * Performs a forward transform on the sample buffer.
     * Converts a time domain signal to frequency domain spectra.
     *
     * @param {Array} buffer The sample buffer. Buffer Length must be power of 2
     *
     * @returns The frequency spectrum array
     */
    FFT.prototype.forward = function(buffer) {
      // Locally scope variables for speed up
      var bufferSize      = this.bufferSize,
          cosTable        = this.cosTable,
          sinTable        = this.sinTable,
          reverseTable    = this.reverseTable,
          real            = this.real,
          imag            = this.imag,
          spectrum        = this.spectrum;

      var k = Math.floor(Math.log(bufferSize) / Math.LN2);

      if (Math.pow(2, k) !== bufferSize) { throw "Invalid buffer size, must be a power of 2."; }
      if (bufferSize !== buffer.length)  { throw "Supplied buffer is not the same size as defined FFT. FFT Size: " + bufferSize + " Buffer Size: " + buffer.length; }

      var halfSize = 1,
          phaseShiftStepReal,
          phaseShiftStepImag,
          currentPhaseShiftReal,
          currentPhaseShiftImag,
          off,
          tr,
          ti,
          tmpReal,
          i;

      for (i = 0; i < bufferSize; i++) {
        real[i] = buffer[reverseTable[i]];
        imag[i] = 0;
      }

      while (halfSize < bufferSize) {
        //phaseShiftStepReal = Math.cos(-Math.PI/halfSize);
        //phaseShiftStepImag = Math.sin(-Math.PI/halfSize);
        phaseShiftStepReal = cosTable[halfSize];
        phaseShiftStepImag = sinTable[halfSize];
        
        currentPhaseShiftReal = 1;
        currentPhaseShiftImag = 0;

        for (var fftStep = 0; fftStep < halfSize; fftStep++) {
          i = fftStep;

          while (i < bufferSize) {
            off = i + halfSize;
            tr = (currentPhaseShiftReal * real[off]) - (currentPhaseShiftImag * imag[off]);
            ti = (currentPhaseShiftReal * imag[off]) + (currentPhaseShiftImag * real[off]);

            real[off] = real[i] - tr;
            imag[off] = imag[i] - ti;
            real[i] += tr;
            imag[i] += ti;

            i += halfSize << 1;
          }

          tmpReal = currentPhaseShiftReal;
          currentPhaseShiftReal = (tmpReal * phaseShiftStepReal) - (currentPhaseShiftImag * phaseShiftStepImag);
          currentPhaseShiftImag = (tmpReal * phaseShiftStepImag) + (currentPhaseShiftImag * phaseShiftStepReal);
        }

        halfSize = halfSize << 1;
      }

      return this.calculateSpectrum();
    };

    FFT.prototype.inverse = function(real, imag, buffer) {
      // Locally scope variables for speed up
      var bufferSize      = this.bufferSize,
          cosTable        = this.cosTable,
          sinTable        = this.sinTable,
          reverseTable    = this.reverseTable,
          spectrum        = this.spectrum;
         
          real = real || this.real;
          imag = imag || this.imag;

      var halfSize = 1,
          phaseShiftStepReal,
          phaseShiftStepImag,
          currentPhaseShiftReal,
          currentPhaseShiftImag,
          off,
          tr,
          ti,
          tmpReal,
          i;

      for (i = 0; i < bufferSize; i++) {
        imag[i] *= -1;
      }

      var revReal = new Float32Array(bufferSize);
      var revImag = new Float32Array(bufferSize);
     
      for (i = 0; i < real.length; i++) {
        revReal[i] = real[reverseTable[i]];
        revImag[i] = imag[reverseTable[i]];
      }
     
      real = revReal;
      imag = revImag;

      while (halfSize < bufferSize) {
        phaseShiftStepReal = cosTable[halfSize];
        phaseShiftStepImag = sinTable[halfSize];
        currentPhaseShiftReal = 1;
        currentPhaseShiftImag = 0;

        for (var fftStep = 0; fftStep < halfSize; fftStep++) {
          i = fftStep;

          while (i < bufferSize) {
            off = i + halfSize;
            tr = (currentPhaseShiftReal * real[off]) - (currentPhaseShiftImag * imag[off]);
            ti = (currentPhaseShiftReal * imag[off]) + (currentPhaseShiftImag * real[off]);

            real[off] = real[i] - tr;
            imag[off] = imag[i] - ti;
            real[i] += tr;
            imag[i] += ti;

            i += halfSize << 1;
          }

          tmpReal = currentPhaseShiftReal;
          currentPhaseShiftReal = (tmpReal * phaseShiftStepReal) - (currentPhaseShiftImag * phaseShiftStepImag);
          currentPhaseShiftImag = (tmpReal * phaseShiftStepImag) + (currentPhaseShiftImag * phaseShiftStepReal);
        }

        halfSize = halfSize << 1;
      }

      // var buffer = new Float32Array(bufferSize); // this should be reused instead
      for (i = 0; i < bufferSize; i++) {
        buffer[i] = real[i] / bufferSize;
      }

      return buffer;
    };

    /**
     * RFFT is a class for calculating the Discrete Fourier Transform of a signal
     * with the Fast Fourier Transform algorithm.
     *
     * This method currently only contains a forward transform but is highly optimized.
     *
     * @param {Number} bufferSize The size of the sample buffer to be computed. Must be power of 2
     * @param {Number} sampleRate The sampleRate of the buffer (eg. 44100)
     *
     * @constructor
     */

    // lookup tables don't really gain us any speed, but they do increase
    // cache footprint, so don't use them in here

    // also we don't use sepearate arrays for real/imaginary parts

    // this one a little more than twice as fast as the one in FFT
    // however I only did the forward transform

    // the rest of this was translated from C, see http://www.jjj.de/fxt/
    // this is the real split radix FFT

    function RFFT(bufferSize, sampleRate) {
      FourierTransform.call(this, bufferSize, sampleRate);

      this.trans = new Float32Array(bufferSize);

      this.reverseTable = new Uint32Array(bufferSize);

      // don't use a lookup table to do the permute, use this instead
      this.reverseBinPermute = function (dest, source) {
        var bufferSize  = this.bufferSize, 
            halfSize    = bufferSize >>> 1, 
            nm1         = bufferSize - 1, 
            i = 1, r = 0, h;

        dest[0] = source[0];

        do {
          r += halfSize;
          dest[i] = source[r];
          dest[r] = source[i];
          
          i++;

          h = halfSize << 1;
          while (h = h >> 1, !((r ^= h) & h));

          if (r >= i) { 
            dest[i]     = source[r]; 
            dest[r]     = source[i];

            dest[nm1-i] = source[nm1-r]; 
            dest[nm1-r] = source[nm1-i];
          }
          i++;
        } while (i < halfSize);
        dest[nm1] = source[nm1];
      };

      this.generateReverseTable = function () {
        var bufferSize  = this.bufferSize, 
            halfSize    = bufferSize >>> 1, 
            nm1         = bufferSize - 1, 
            i = 1, r = 0, h;

        this.reverseTable[0] = 0;

        do {
          r += halfSize;
          
          this.reverseTable[i] = r;
          this.reverseTable[r] = i;

          i++;

          h = halfSize << 1;
          while (h = h >> 1, !((r ^= h) & h));

          if (r >= i) { 
            this.reverseTable[i] = r;
            this.reverseTable[r] = i;

            this.reverseTable[nm1-i] = nm1-r;
            this.reverseTable[nm1-r] = nm1-i;
          }
          i++;
        } while (i < halfSize);

        this.reverseTable[nm1] = nm1;
      };

      this.generateReverseTable();
    }


    // Ordering of output:
    //
    // trans[0]     = re[0] (==zero frequency, purely real)
    // trans[1]     = re[1]
    //             ...
    // trans[n/2-1] = re[n/2-1]
    // trans[n/2]   = re[n/2]    (==nyquist frequency, purely real)
    //
    // trans[n/2+1] = im[n/2-1]
    // trans[n/2+2] = im[n/2-2]
    //             ...
    // trans[n-1]   = im[1] 

    RFFT.prototype.forward = function(buffer) {
      var n         = this.bufferSize, 
          spectrum  = this.spectrum,
          x         = this.trans, 
          TWO_PI    = 2*Math.PI,
          sqrt      = Math.sqrt,
          i         = n >>> 1,
          bSi       = 2 / n,
          n2, n4, n8, nn, 
          t1, t2, t3, t4, 
          i1, i2, i3, i4, i5, i6, i7, i8, 
          st1, cc1, ss1, cc3, ss3,
          e, 
          a,
          rval, ival, mag; 

      this.reverseBinPermute(x, buffer);

      /*
      var reverseTable = this.reverseTable;

      for (var k = 0, len = reverseTable.length; k < len; k++) {
        x[k] = buffer[reverseTable[k]];
      }
      */

      for (var ix = 0, id = 4; ix < n; id *= 4) {
        for (var i0 = ix; i0 < n; i0 += id) {
          //sumdiff(x[i0], x[i0+1]); // {a, b}  <--| {a+b, a-b}
          st1 = x[i0] - x[i0+1];
          x[i0] += x[i0+1];
          x[i0+1] = st1;
        } 
        ix = 2*(id-1);
      }

      n2 = 2;
      nn = n >>> 1;

      while((nn = nn >>> 1)) {
        ix = 0;
        n2 = n2 << 1;
        id = n2 << 1;
        n4 = n2 >>> 2;
        n8 = n2 >>> 3;
        do {
          if(n4 !== 1) {
            for(i0 = ix; i0 < n; i0 += id) {
              i1 = i0;
              i2 = i1 + n4;
              i3 = i2 + n4;
              i4 = i3 + n4;
         
              //diffsum3_r(x[i3], x[i4], t1); // {a, b, s} <--| {a, b-a, a+b}
              t1 = x[i3] + x[i4];
              x[i4] -= x[i3];
              //sumdiff3(x[i1], t1, x[i3]);   // {a, b, d} <--| {a+b, b, a-b}
              x[i3] = x[i1] - t1; 
              x[i1] += t1;
         
              i1 += n8;
              i2 += n8;
              i3 += n8;
              i4 += n8;
             
              //sumdiff(x[i3], x[i4], t1, t2); // {s, d}  <--| {a+b, a-b}
              t1 = x[i3] + x[i4];
              t2 = x[i3] - x[i4];
             
              t1 = -t1 * Math.SQRT1_2;
              t2 *= Math.SQRT1_2;
         
              // sumdiff(t1, x[i2], x[i4], x[i3]); // {s, d}  <--| {a+b, a-b}
              st1 = x[i2];
              x[i4] = t1 + st1; 
              x[i3] = t1 - st1;
              
              //sumdiff3(x[i1], t2, x[i2]); // {a, b, d} <--| {a+b, b, a-b}
              x[i2] = x[i1] - t2;
              x[i1] += t2;
            }
          } else {
            for(i0 = ix; i0 < n; i0 += id) {
              i1 = i0;
              i2 = i1 + n4;
              i3 = i2 + n4;
              i4 = i3 + n4;
         
              //diffsum3_r(x[i3], x[i4], t1); // {a, b, s} <--| {a, b-a, a+b}
              t1 = x[i3] + x[i4]; 
              x[i4] -= x[i3];
              
              //sumdiff3(x[i1], t1, x[i3]);   // {a, b, d} <--| {a+b, b, a-b}
              x[i3] = x[i1] - t1; 
              x[i1] += t1;
            }
          }
       
          ix = (id << 1) - n2;
          id = id << 2;
        } while (ix < n);
     
        e = TWO_PI / n2;

        for (var j = 1; j < n8; j++) {
          a = j * e;
          ss1 = Math.sin(a);
          cc1 = Math.cos(a);

          //ss3 = sin(3*a); cc3 = cos(3*a);
          cc3 = 4*cc1*(cc1*cc1-0.75);
          ss3 = 4*ss1*(0.75-ss1*ss1);
       
          ix = 0; id = n2 << 1;
          do {
            for (i0 = ix; i0 < n; i0 += id) {
              i1 = i0 + j;
              i2 = i1 + n4;
              i3 = i2 + n4;
              i4 = i3 + n4;
           
              i5 = i0 + n4 - j;
              i6 = i5 + n4;
              i7 = i6 + n4;
              i8 = i7 + n4;
           
              //cmult(c, s, x, y, &u, &v)
              //cmult(cc1, ss1, x[i7], x[i3], t2, t1); // {u,v} <--| {x*c-y*s, x*s+y*c}
              t2 = x[i7]*cc1 - x[i3]*ss1; 
              t1 = x[i7]*ss1 + x[i3]*cc1;
              
              //cmult(cc3, ss3, x[i8], x[i4], t4, t3);
              t4 = x[i8]*cc3 - x[i4]*ss3; 
              t3 = x[i8]*ss3 + x[i4]*cc3;
           
              //sumdiff(t2, t4);   // {a, b} <--| {a+b, a-b}
              st1 = t2 - t4;
              t2 += t4;
              t4 = st1;
              
              //sumdiff(t2, x[i6], x[i8], x[i3]); // {s, d}  <--| {a+b, a-b}
              //st1 = x[i6]; x[i8] = t2 + st1; x[i3] = t2 - st1;
              x[i8] = t2 + x[i6]; 
              x[i3] = t2 - x[i6];
             
              //sumdiff_r(t1, t3); // {a, b} <--| {a+b, b-a}
              st1 = t3 - t1;
              t1 += t3;
              t3 = st1;
              
              //sumdiff(t3, x[i2], x[i4], x[i7]); // {s, d}  <--| {a+b, a-b}
              //st1 = x[i2]; x[i4] = t3 + st1; x[i7] = t3 - st1;
              x[i4] = t3 + x[i2]; 
              x[i7] = t3 - x[i2];
             
              //sumdiff3(x[i1], t1, x[i6]);   // {a, b, d} <--| {a+b, b, a-b}
              x[i6] = x[i1] - t1; 
              x[i1] += t1;
              
              //diffsum3_r(t4, x[i5], x[i2]); // {a, b, s} <--| {a, b-a, a+b}
              x[i2] = t4 + x[i5]; 
              x[i5] -= t4;
            }
         
            ix = (id << 1) - n2;
            id = id << 2;
       
          } while (ix < n);
        }
      }

      while (--i) {
        rval = x[i];
        ival = x[n-i-1];
        mag = bSi * sqrt(rval * rval + ival * ival);

        if (mag > this.peak) {
          this.peakBand = i;
          this.peak = mag;
        }

        spectrum[i] = mag;
      }

      spectrum[0] = bSi * x[0];

      return spectrum;
    };

    function Sampler(file, bufferSize, sampleRate, playStart, playEnd, loopStart, loopEnd, loopMode) {
      this.file = file;
      this.bufferSize = bufferSize;
      this.sampleRate = sampleRate;
      this.playStart  = playStart || 0; // 0%
      this.playEnd    = playEnd   || 1; // 100%
      this.loopStart  = loopStart || 0;
      this.loopEnd    = loopEnd   || 1;
      this.loopMode   = loopMode  || DSP.OFF;
      this.loaded     = false;
      this.samples    = [];
      this.signal     = new Float32Array(bufferSize);
      this.frameCount = 0;
      this.envelope   = null;
      this.amplitude  = 1;
      this.rootFrequency = 110; // A2 110
      this.frequency  = 550;
      this.step       = this.frequency / this.rootFrequency;
      this.duration   = 0;
      this.samplesProcessed = 0;
      this.playhead   = 0;
     
      var audio = /* new Audio();*/ document.createElement("AUDIO");
      var self = this;
     
      this.loadSamples = function(event) {
        var buffer = DSP.getChannel(DSP.MIX, event.frameBuffer);
        for ( var i = 0; i < buffer.length; i++) {
          self.samples.push(buffer[i]);
        }
      };
     
      this.loadComplete = function() {
        // convert flexible js array into a fast typed array
        self.samples = new Float32Array(self.samples);
        self.loaded = true;
      };
     
      this.loadMetaData = function() {
        self.duration = audio.duration;
      };
     
      audio.addEventListener("MozAudioAvailable", this.loadSamples, false);
      audio.addEventListener("loadedmetadata", this.loadMetaData, false);
      audio.addEventListener("ended", this.loadComplete, false);
      audio.muted = true;
      audio.src = file;
      audio.play();
    }

    Sampler.prototype.applyEnvelope = function() {
      this.envelope.process(this.signal);
      return this.signal;
    };

    Sampler.prototype.generate = function() {
      var frameOffset = this.frameCount * this.bufferSize;
     
      var loopWidth = this.playEnd * this.samples.length - this.playStart * this.samples.length;
      var playStartSamples = this.playStart * this.samples.length; // ie 0.5 -> 50% of the length
      var playEndSamples = this.playEnd * this.samples.length; // ie 0.5 -> 50% of the length
      var offset;

      for ( var i = 0; i < this.bufferSize; i++ ) {
        switch (this.loopMode) {
          case DSP.OFF:
            this.playhead = Math.round(this.samplesProcessed * this.step + playStartSamples);
            if (this.playhead < (this.playEnd * this.samples.length) ) {
              this.signal[i] = this.samples[this.playhead] * this.amplitude;
            } else {
              this.signal[i] = 0;
            }
            break;
         
          case DSP.FW:
            this.playhead = Math.round((this.samplesProcessed * this.step) % loopWidth + playStartSamples);
            if (this.playhead < (this.playEnd * this.samples.length) ) {
              this.signal[i] = this.samples[this.playhead] * this.amplitude;
            }
            break;
           
          case DSP.BW:
            this.playhead = playEndSamples - Math.round((this.samplesProcessed * this.step) % loopWidth);
            if (this.playhead < (this.playEnd * this.samples.length) ) {
              this.signal[i] = this.samples[this.playhead] * this.amplitude;
            }
            break;
           
          case DSP.FWBW:
            if ( Math.floor(this.samplesProcessed * this.step / loopWidth) % 2 === 0 ) {
              this.playhead = Math.round((this.samplesProcessed * this.step) % loopWidth + playStartSamples);
            } else {
              this.playhead = playEndSamples - Math.round((this.samplesProcessed * this.step) % loopWidth);
            }  
            if (this.playhead < (this.playEnd * this.samples.length) ) {
              this.signal[i] = this.samples[this.playhead] * this.amplitude;
            }
            break;
        }
        this.samplesProcessed++;
      }

      this.frameCount++;

      return this.signal;
    };

    Sampler.prototype.setFreq = function(frequency) {
        var totalProcessed = this.samplesProcessed * this.step;
        this.frequency = frequency;
        this.step = this.frequency / this.rootFrequency;
        this.samplesProcessed = Math.round(totalProcessed/this.step);
    };

    Sampler.prototype.reset = function() {
      this.samplesProcessed = 0;
      this.playhead = 0;
    };

    /**
     * Oscillator class for generating and modifying signals
     *
     * @param {Number} type       A waveform constant (eg. DSP.SINE)
     * @param {Number} frequency  Initial frequency of the signal
     * @param {Number} amplitude  Initial amplitude of the signal
     * @param {Number} bufferSize Size of the sample buffer to generate
     * @param {Number} sampleRate The sample rate of the signal
     *
     * @contructor
     */
    function Oscillator(type, frequency, amplitude, bufferSize, sampleRate) {
      this.frequency  = frequency;
      this.amplitude  = amplitude;
      this.bufferSize = bufferSize;
      this.sampleRate = sampleRate;
      //this.pulseWidth = pulseWidth;
      this.frameCount = 0;
     
      this.waveTableLength = 2048;

      this.cyclesPerSample = frequency / sampleRate;

      this.signal = new Float32Array(bufferSize);
      this.envelope = null;

      switch(parseInt(type, 10)) {
        case DSP.TRIANGLE:
          this.func = Oscillator.Triangle;
          break;

        case DSP.SAW:
          this.func = Oscillator.Saw;
          break;

        case DSP.SQUARE:
          this.func = Oscillator.Square;
          break;

        default:
        case DSP.SINE:
          this.func = Oscillator.Sine;
          break;
      }

      this.generateWaveTable = function() {
        Oscillator.waveTable[this.func] = new Float32Array(2048);
        var waveTableTime = this.waveTableLength / this.sampleRate;
        var waveTableHz = 1 / waveTableTime;

        for (var i = 0; i < this.waveTableLength; i++) {
          Oscillator.waveTable[this.func][i] = this.func(i * waveTableHz/this.sampleRate);
        }
      };

      if ( typeof Oscillator.waveTable === 'undefined' ) {
        Oscillator.waveTable = {};
      }

      if ( typeof Oscillator.waveTable[this.func] === 'undefined' ) {
        this.generateWaveTable();
      }
     
      this.waveTable = Oscillator.waveTable[this.func];
    }

    /**
     * Set the amplitude of the signal
     *
     * @param {Number} amplitude The amplitude of the signal (between 0 and 1)
     */
    Oscillator.prototype.setAmp = function(amplitude) {
      if (amplitude >= 0 && amplitude <= 1) {
        this.amplitude = amplitude;
      } else {
        throw "Amplitude out of range (0..1).";
      }
    };
      
    /**
     * Set the frequency of the signal
     *
     * @param {Number} frequency The frequency of the signal
     */  
    Oscillator.prototype.setFreq = function(frequency) {
      this.frequency = frequency;
      this.cyclesPerSample = frequency / this.sampleRate;
    };
         
    // Add an oscillator
    Oscillator.prototype.add = function(oscillator) {
      for ( var i = 0; i < this.bufferSize; i++ ) {
        //this.signal[i] += oscillator.valueAt(i);
        this.signal[i] += oscillator.signal[i];
      }
     
      return this.signal;
    };
         
    // Add a signal to the current generated osc signal
    Oscillator.prototype.addSignal = function(signal) {
      for ( var i = 0; i < signal.length; i++ ) {
        if ( i >= this.bufferSize ) {
          break;
        }
        this.signal[i] += signal[i];
       
        /*
        // Constrain amplitude
        if ( this.signal[i] > 1 ) {
          this.signal[i] = 1;
        } else if ( this.signal[i] < -1 ) {
          this.signal[i] = -1;
        }
        */
      }
      return this.signal;
    };
         
    // Add an envelope to the oscillator
    Oscillator.prototype.addEnvelope = function(envelope) {
      this.envelope = envelope;
    };

    Oscillator.prototype.applyEnvelope = function() {
      this.envelope.process(this.signal);
    };
         
    Oscillator.prototype.valueAt = function(offset) {
      return this.waveTable[offset % this.waveTableLength];
    };
         
    Oscillator.prototype.generate = function() {
      var frameOffset = this.frameCount * this.bufferSize;
      var step = this.waveTableLength * this.frequency / this.sampleRate;
      var offset;

      for ( var i = 0; i < this.bufferSize; i++ ) {
        //var step = (frameOffset + i) * this.cyclesPerSample % 1;
        //this.signal[i] = this.func(step) * this.amplitude;
        //this.signal[i] = this.valueAt(Math.round((frameOffset + i) * step)) * this.amplitude;
        offset = Math.round((frameOffset + i) * step);
        this.signal[i] = this.waveTable[offset % this.waveTableLength] * this.amplitude;
      }

      this.frameCount++;

      return this.signal;
    };

    Oscillator.Sine = function(step) {
      return Math.sin(DSP.TWO_PI * step);
    };

    Oscillator.Square = function(step) {
      return step < 0.5 ? 1 : -1;
    };

    Oscillator.Saw = function(step) {
      return 2 * (step - Math.round(step));
    };

    Oscillator.Triangle = function(step) {
      return 1 - 4 * Math.abs(Math.round(step) - step);
    };

    Oscillator.Pulse = function(step) {
      // stub
    };
     
    function ADSR(attackLength, decayLength, sustainLevel, sustainLength, releaseLength, sampleRate) {
      this.sampleRate = sampleRate;
      // Length in seconds
      this.attackLength  = attackLength;
      this.decayLength   = decayLength;
      this.sustainLevel  = sustainLevel;
      this.sustainLength = sustainLength;
      this.releaseLength = releaseLength;
      this.sampleRate    = sampleRate;
     
      // Length in samples
      this.attackSamples  = attackLength  * sampleRate;
      this.decaySamples   = decayLength   * sampleRate;
      this.sustainSamples = sustainLength * sampleRate;
      this.releaseSamples = releaseLength * sampleRate;
     
      // Updates the envelope sample positions
      this.update = function() {
        this.attack         =                this.attackSamples;
        this.decay          = this.attack  + this.decaySamples;
        this.sustain        = this.decay   + this.sustainSamples;
        this.release        = this.sustain + this.releaseSamples;
      };
     
      this.update();
     
      this.samplesProcessed = 0;
    }

    ADSR.prototype.noteOn = function() {
      this.samplesProcessed = 0;
      this.sustainSamples = this.sustainLength * this.sampleRate;
      this.update();
    };

    // Send a note off when using a sustain of infinity to let the envelope enter the release phase
    ADSR.prototype.noteOff = function() {
      this.sustainSamples = this.samplesProcessed - this.decaySamples;
      this.update();
    };

    ADSR.prototype.processSample = function(sample) {
      var amplitude = 0;

      if ( this.samplesProcessed <= this.attack ) {
        amplitude = 0 + (1 - 0) * ((this.samplesProcessed - 0) / (this.attack - 0));
      } else if ( this.samplesProcessed > this.attack && this.samplesProcessed <= this.decay ) {
        amplitude = 1 + (this.sustainLevel - 1) * ((this.samplesProcessed - this.attack) / (this.decay - this.attack));
      } else if ( this.samplesProcessed > this.decay && this.samplesProcessed <= this.sustain ) {
        amplitude = this.sustainLevel;
      } else if ( this.samplesProcessed > this.sustain && this.samplesProcessed <= this.release ) {
        amplitude = this.sustainLevel + (0 - this.sustainLevel) * ((this.samplesProcessed - this.sustain) / (this.release - this.sustain));
      }
     
      return sample * amplitude;
    };

    ADSR.prototype.value = function() {
      var amplitude = 0;

      if ( this.samplesProcessed <= this.attack ) {
        amplitude = 0 + (1 - 0) * ((this.samplesProcessed - 0) / (this.attack - 0));
      } else if ( this.samplesProcessed > this.attack && this.samplesProcessed <= this.decay ) {
        amplitude = 1 + (this.sustainLevel - 1) * ((this.samplesProcessed - this.attack) / (this.decay - this.attack));
      } else if ( this.samplesProcessed > this.decay && this.samplesProcessed <= this.sustain ) {
        amplitude = this.sustainLevel;
      } else if ( this.samplesProcessed > this.sustain && this.samplesProcessed <= this.release ) {
        amplitude = this.sustainLevel + (0 - this.sustainLevel) * ((this.samplesProcessed - this.sustain) / (this.release - this.sustain));
      }
     
      return amplitude;
    };
         
    ADSR.prototype.process = function(buffer) {
      for ( var i = 0; i < buffer.length; i++ ) {
        buffer[i] *= this.value();

        this.samplesProcessed++;
      }
     
      return buffer;
    };
         
         
    ADSR.prototype.isActive = function() {
      if ( this.samplesProcessed > this.release || this.samplesProcessed === -1 ) {
        return false;
      } else {
        return true;
      }
    };

    ADSR.prototype.disable = function() {
      this.samplesProcessed = -1;
    };
     
    function IIRFilter(type, cutoff, resonance, sampleRate) {
      this.sampleRate = sampleRate;

      switch(type) {
        case DSP.LOWPASS:
        case DSP.LP12:
          this.func = new IIRFilter.LP12(cutoff, resonance, sampleRate);
          break;
      }
    }

    IIRFilter.prototype.__defineGetter__('cutoff',
      function() {
        return this.func.cutoff;
      }
    );

    IIRFilter.prototype.__defineGetter__('resonance',
      function() {
        return this.func.resonance;
      }
    );

    IIRFilter.prototype.set = function(cutoff, resonance) {
      this.func.calcCoeff(cutoff, resonance);
    };

    IIRFilter.prototype.process = function(buffer) {
      this.func.process(buffer);
    };

    // Add an envelope to the filter
    IIRFilter.prototype.addEnvelope = function(envelope) {
      if ( envelope instanceof ADSR ) {
        this.func.addEnvelope(envelope);
      } else {
        throw "Not an envelope.";
      }
    };

    IIRFilter.LP12 = function(cutoff, resonance, sampleRate) {
      this.sampleRate = sampleRate;
      this.vibraPos   = 0;
      this.vibraSpeed = 0;
      this.envelope = false;
     
      this.calcCoeff = function(cutoff, resonance) {
        this.w = 2.0 * Math.PI * cutoff / this.sampleRate;
        this.q = 1.0 - this.w / (2.0 * (resonance + 0.5 / (1.0 + this.w)) + this.w - 2.0);
        this.r = this.q * this.q;
        this.c = this.r + 1.0 - 2.0 * Math.cos(this.w) * this.q;
       
        this.cutoff = cutoff;
        this.resonance = resonance;
      };

      this.calcCoeff(cutoff, resonance);

      this.process = function(buffer) {
        for ( var i = 0; i < buffer.length; i++ ) {
          this.vibraSpeed += (buffer[i] - this.vibraPos) * this.c;
          this.vibraPos   += this.vibraSpeed;
          this.vibraSpeed *= this.r;
       
          /*
          var temp = this.vibraPos;
         
          if ( temp > 1.0 ) {
            temp = 1.0;
          } else if ( temp < -1.0 ) {
            temp = -1.0;
          } else if ( temp != temp ) {
            temp = 1;
          }
         
          buffer[i] = temp;
          */

          if (this.envelope) {
            buffer[i] = (buffer[i] * (1 - this.envelope.value())) + (this.vibraPos * this.envelope.value());
            this.envelope.samplesProcessed++;
          } else {
            buffer[i] = this.vibraPos;
          }
        }
      };
    }; 

    IIRFilter.LP12.prototype.addEnvelope = function(envelope) {
      this.envelope = envelope;
    };

    function IIRFilter2(type, cutoff, resonance, sampleRate) {
      this.type = type;
      this.cutoff = cutoff;
      this.resonance = resonance;
      this.sampleRate = sampleRate;

      this.f = Float32Array(4);
      this.f[0] = 0.0; // lp
      this.f[1] = 0.0; // hp
      this.f[2] = 0.0; // bp
      this.f[3] = 0.0; // br 
     
      this.calcCoeff = function(cutoff, resonance) {
        this.freq = 2 * Math.sin(Math.PI * Math.min(0.25, cutoff/(this.sampleRate*2)));  
        this.damp = Math.min(2 * (1 - Math.pow(resonance, 0.25)), Math.min(2, 2/this.freq - this.freq * 0.5));
      };

      this.calcCoeff(cutoff, resonance);
    }

    IIRFilter2.prototype.process = function(buffer) {
      var input, output;
      var f = this.f;

      for ( var i = 0; i < buffer.length; i++ ) {
        input = buffer[i];

        // first pass
        f[3] = input - this.damp * f[2];
        f[0] = f[0] + this.freq * f[2];
        f[1] = f[3] - f[0];
        f[2] = this.freq * f[1] + f[2];
        output = 0.5 * f[this.type];

        // second pass
        f[3] = input - this.damp * f[2];
        f[0] = f[0] + this.freq * f[2];
        f[1] = f[3] - f[0];
        f[2] = this.freq * f[1] + f[2];
        output += 0.5 * f[this.type];

        if (this.envelope) {
          buffer[i] = (buffer[i] * (1 - this.envelope.value())) + (output * this.envelope.value());
          this.envelope.samplesProcessed++;
        } else {
          buffer[i] = output;
        }
      }
    };

    IIRFilter2.prototype.addEnvelope = function(envelope) {
      if ( envelope instanceof ADSR ) {
        this.envelope = envelope;
      } else {
        throw "This is not an envelope.";
      }
    };

    IIRFilter2.prototype.set = function(cutoff, resonance) {
      this.calcCoeff(cutoff, resonance);
    };



    function WindowFunction(type, alpha) {
      this.alpha = alpha;
     
      switch(type) {
        case DSP.BARTLETT:
          this.func = WindowFunction.Bartlett;
          break;
         
        case DSP.BARTLETTHANN:
          this.func = WindowFunction.BartlettHann;
          break;
         
        case DSP.BLACKMAN:
          this.func = WindowFunction.Blackman;
          this.alpha = this.alpha || 0.16;
          break;
       
        case DSP.COSINE:
          this.func = WindowFunction.Cosine;
          break;
         
        case DSP.GAUSS:
          this.func = WindowFunction.Gauss;
          this.alpha = this.alpha || 0.25;
          break;
         
        case DSP.HAMMING:
          this.func = WindowFunction.Hamming;
          break;
         
        case DSP.HANN:
          this.func = WindowFunction.Hann;
          break;
       
        case DSP.LANCZOS:
          this.func = WindowFunction.Lanczoz;
          break;
         
        case DSP.RECTANGULAR:
          this.func = WindowFunction.Rectangular;
          break;
         
        case DSP.TRIANGULAR:
          this.func = WindowFunction.Triangular;
          break;
      }
    }

    WindowFunction.prototype.process = function(buffer) {
      var length = buffer.length;
      for ( var i = 0; i < length; i++ ) {
        buffer[i] *= this.func(length, i, this.alpha);
      }
      return buffer;
    };

    WindowFunction.Bartlett = function(length, index) {
      return 2 / (length - 1) * ((length - 1) / 2 - Math.abs(index - (length - 1) / 2));
    };

    WindowFunction.BartlettHann = function(length, index) {
      return 0.62 - 0.48 * Math.abs(index / (length - 1) - 0.5) - 0.38 * Math.cos(DSP.TWO_PI * index / (length - 1));
    };

    WindowFunction.Blackman = function(length, index, alpha) {
      var a0 = (1 - alpha) / 2;
      var a1 = 0.5;
      var a2 = alpha / 2;

      return a0 - a1 * Math.cos(DSP.TWO_PI * index / (length - 1)) + a2 * Math.cos(4 * Math.PI * index / (length - 1));
    };

    WindowFunction.Cosine = function(length, index) {
      return Math.cos(Math.PI * index / (length - 1) - Math.PI / 2);
    };

    WindowFunction.Gauss = function(length, index, alpha) {
      return Math.pow(Math.E, -0.5 * Math.pow((index - (length - 1) / 2) / (alpha * (length - 1) / 2), 2));
    };

    WindowFunction.Hamming = function(length, index) {
      return 0.54 - 0.46 * Math.cos(DSP.TWO_PI * index / (length - 1));
    };

    WindowFunction.Hann = function(length, index) {
      return 0.5 * (1 - Math.cos(DSP.TWO_PI * index / (length - 1)));
    };

    WindowFunction.Lanczos = function(length, index) {
      var x = 2 * index / (length - 1) - 1;
      return Math.sin(Math.PI * x) / (Math.PI * x);
    };

    WindowFunction.Rectangular = function(length, index) {
      return 1;
    };

    WindowFunction.Triangular = function(length, index) {
      return 2 / length * (length / 2 - Math.abs(index - (length - 1) / 2));
    };

    function sinh (arg) {
      // Returns the hyperbolic sine of the number, defined as (exp(number) - exp(-number))/2 
      //
      // version: 1004.2314
      // discuss at: http://phpjs.org/functions/sinh    // +   original by: Onno Marsman
      // *     example 1: sinh(-0.9834330348825909);
      // *     returns 1: -1.1497971402636502
      return (Math.exp(arg) - Math.exp(-arg))/2;
    }

    /* 
     *  Biquad filter
     * 
     *  Created by Ricard Marxer <email@ricardmarxer.com> on 2010-05-23.
     *  Copyright 2010 Ricard Marxer. All rights reserved.
     *
     */
    // Implementation based on:
    // http://www.musicdsp.org/files/Audio-EQ-Cookbook.txt
    function Biquad(type, sampleRate) {
      this.Fs = sampleRate;
      this.type = type;  // type of the filter
      this.parameterType = DSP.Q; // type of the parameter

      this.x_1_l = 0;
      this.x_2_l = 0;
      this.y_1_l = 0;
      this.y_2_l = 0;

      this.x_1_r = 0;
      this.x_2_r = 0;
      this.y_1_r = 0;
      this.y_2_r = 0;

      this.b0 = 1;
      this.a0 = 1;

      this.b1 = 0;
      this.a1 = 0;

      this.b2 = 0;
      this.a2 = 0;

      this.b0a0 = this.b0 / this.a0;
      this.b1a0 = this.b1 / this.a0;
      this.b2a0 = this.b2 / this.a0;
      this.a1a0 = this.a1 / this.a0;
      this.a2a0 = this.a2 / this.a0;

      this.f0 = 3000;   // "wherever it's happenin', man."  Center Frequency or
                        // Corner Frequency, or shelf midpoint frequency, depending
                        // on which filter type.  The "significant frequency".

      this.dBgain = 12; // used only for peaking and shelving filters

      this.Q = 1;       // the EE kind of definition, except for peakingEQ in which A*Q is
                        // the classic EE Q.  That adjustment in definition was made so that
                        // a boost of N dB followed by a cut of N dB for identical Q and
                        // f0/Fs results in a precisely flat unity gain filter or "wire".

      this.BW = -3;     // the bandwidth in octaves (between -3 dB frequencies for BPF
                        // and notch or between midpoint (dBgain/2) gain frequencies for
                        // peaking EQ

      this.S = 1;       // a "shelf slope" parameter (for shelving EQ only).  When S = 1,
                        // the shelf slope is as steep as it can be and remain monotonically
                        // increasing or decreasing gain with frequency.  The shelf slope, in
                        // dB/octave, remains proportional to S for all other values for a
                        // fixed f0/Fs and dBgain.

      this.coefficients = function() {
        var b = [this.b0, this.b1, this.b2];
        var a = [this.a0, this.a1, this.a2];
        return {b: b, a:a};
      };

      this.setFilterType = function(type) {
        this.type = type;
        this.recalculateCoefficients();
      };

      this.setSampleRate = function(rate) {
        this.Fs = rate;
        this.recalculateCoefficients();
      };

      this.setQ = function(q) {
        this.parameterType = DSP.Q;
        this.Q = Math.max(Math.min(q, 115.0), 0.001);
        this.recalculateCoefficients();
      };

      this.setBW = function(bw) {
        this.parameterType = DSP.BW;
        this.BW = bw;
        this.recalculateCoefficients();
      };

      this.setS = function(s) {
        this.parameterType = DSP.S;
        this.S = Math.max(Math.min(s, 5.0), 0.0001);
        this.recalculateCoefficients();
      };

      this.setF0 = function(freq) {
        this.f0 = freq;
        this.recalculateCoefficients();
      }; 
     
      this.setDbGain = function(g) {
        this.dBgain = g;
        this.recalculateCoefficients();
      };

      this.recalculateCoefficients = function() {
        var A;
        if (type === DSP.PEAKING_EQ || type === DSP.LOW_SHELF || type === DSP.HIGH_SHELF ) {
          A = Math.pow(10, (this.dBgain/40));  // for peaking and shelving EQ filters only
        } else {
          A  = Math.sqrt( Math.pow(10, (this.dBgain/20)) );   
        }

        var w0 = DSP.TWO_PI * this.f0 / this.Fs;

        var cosw0 = Math.cos(w0);
        var sinw0 = Math.sin(w0);

        var alpha = 0;
       
        switch (this.parameterType) {
          case DSP.Q:
            alpha = sinw0/(2*this.Q);
            break;
               
          case DSP.BW:
            alpha = sinw0 * sinh( Math.LN2/2 * this.BW * w0/sinw0 );
            break;

          case DSP.S:
            alpha = sinw0/2 * Math.sqrt( (A + 1/A)*(1/this.S - 1) + 2 );
            break;
        }

        /**
            FYI: The relationship between bandwidth and Q is
                 1/Q = 2*sinh(ln(2)/2*BW*w0/sin(w0))     (digital filter w BLT)
            or   1/Q = 2*sinh(ln(2)/2*BW)             (analog filter prototype)

            The relationship between shelf slope and Q is
                 1/Q = sqrt((A + 1/A)*(1/S - 1) + 2)
        */

        var coeff;

        switch (this.type) {
          case DSP.LPF:       // H(s) = 1 / (s^2 + s/Q + 1)
            this.b0 =  (1 - cosw0)/2;
            this.b1 =   1 - cosw0;
            this.b2 =  (1 - cosw0)/2;
            this.a0 =   1 + alpha;
            this.a1 =  -2 * cosw0;
            this.a2 =   1 - alpha;
            break;

          case DSP.HPF:       // H(s) = s^2 / (s^2 + s/Q + 1)
            this.b0 =  (1 + cosw0)/2;
            this.b1 = -(1 + cosw0);
            this.b2 =  (1 + cosw0)/2;
            this.a0 =   1 + alpha;
            this.a1 =  -2 * cosw0;
            this.a2 =   1 - alpha;
            break;

          case DSP.BPF_CONSTANT_SKIRT:       // H(s) = s / (s^2 + s/Q + 1)  (constant skirt gain, peak gain = Q)
            this.b0 =   sinw0/2;
            this.b1 =   0;
            this.b2 =  -sinw0/2;
            this.a0 =   1 + alpha;
            this.a1 =  -2*cosw0;
            this.a2 =   1 - alpha;
            break;

          case DSP.BPF_CONSTANT_PEAK:       // H(s) = (s/Q) / (s^2 + s/Q + 1)      (constant 0 dB peak gain)
            this.b0 =   alpha;
            this.b1 =   0;
            this.b2 =  -alpha;
            this.a0 =   1 + alpha;
            this.a1 =  -2*cosw0;
            this.a2 =   1 - alpha;
            break;

          case DSP.NOTCH:     // H(s) = (s^2 + 1) / (s^2 + s/Q + 1)
            this.b0 =   1;
            this.b1 =  -2*cosw0;
            this.b2 =   1;
            this.a0 =   1 + alpha;
            this.a1 =  -2*cosw0;
            this.a2 =   1 - alpha;
            break;

          case DSP.APF:       // H(s) = (s^2 - s/Q + 1) / (s^2 + s/Q + 1)
            this.b0 =   1 - alpha;
            this.b1 =  -2*cosw0;
            this.b2 =   1 + alpha;
            this.a0 =   1 + alpha;
            this.a1 =  -2*cosw0;
            this.a2 =   1 - alpha;
            break;

          case DSP.PEAKING_EQ:  // H(s) = (s^2 + s*(A/Q) + 1) / (s^2 + s/(A*Q) + 1)
            this.b0 =   1 + alpha*A;
            this.b1 =  -2*cosw0;
            this.b2 =   1 - alpha*A;
            this.a0 =   1 + alpha/A;
            this.a1 =  -2*cosw0;
            this.a2 =   1 - alpha/A;
            break;

          case DSP.LOW_SHELF:   // H(s) = A * (s^2 + (sqrt(A)/Q)*s + A)/(A*s^2 + (sqrt(A)/Q)*s + 1)
            coeff = sinw0 * Math.sqrt( (A^2 + 1)*(1/this.S - 1) + 2*A );
            this.b0 =    A*((A+1) - (A-1)*cosw0 + coeff);
            this.b1 =  2*A*((A-1) - (A+1)*cosw0);
            this.b2 =    A*((A+1) - (A-1)*cosw0 - coeff);
            this.a0 =       (A+1) + (A-1)*cosw0 + coeff;
            this.a1 =   -2*((A-1) + (A+1)*cosw0);
            this.a2 =       (A+1) + (A-1)*cosw0 - coeff;
            break;

          case DSP.HIGH_SHELF:   // H(s) = A * (A*s^2 + (sqrt(A)/Q)*s + 1)/(s^2 + (sqrt(A)/Q)*s + A)
            coeff = sinw0 * Math.sqrt( (A^2 + 1)*(1/this.S - 1) + 2*A );
            this.b0 =    A*((A+1) + (A-1)*cosw0 + coeff);
            this.b1 = -2*A*((A-1) + (A+1)*cosw0);
            this.b2 =    A*((A+1) + (A-1)*cosw0 - coeff);
            this.a0 =       (A+1) - (A-1)*cosw0 + coeff;
            this.a1 =    2*((A-1) - (A+1)*cosw0);
            this.a2 =       (A+1) - (A-1)*cosw0 - coeff;
            break;
        }
       
        this.b0a0 = this.b0/this.a0;
        this.b1a0 = this.b1/this.a0;
        this.b2a0 = this.b2/this.a0;
        this.a1a0 = this.a1/this.a0;
        this.a2a0 = this.a2/this.a0;
      };

      this.process = function(buffer) {
          //y[n] = (b0/a0)*x[n] + (b1/a0)*x[n-1] + (b2/a0)*x[n-2]
          //       - (a1/a0)*y[n-1] - (a2/a0)*y[n-2]

          var len = buffer.length;
          var output = new Float32Array(len);

          for ( var i=0; i<buffer.length; i++ ) {
            output[i] = this.b0a0*buffer[i] + this.b1a0*this.x_1_l + this.b2a0*this.x_2_l - this.a1a0*this.y_1_l - this.a2a0*this.y_2_l;
            this.y_2_l = this.y_1_l;
            this.y_1_l = output[i];
            this.x_2_l = this.x_1_l;
            this.x_1_l = buffer[i];
          }

          return output;
      };

      this.processStereo = function(buffer) {
          //y[n] = (b0/a0)*x[n] + (b1/a0)*x[n-1] + (b2/a0)*x[n-2]
          //       - (a1/a0)*y[n-1] - (a2/a0)*y[n-2]

          var len = buffer.length;
          var output = new Float32Array(len);
         
          for (var i = 0; i < len/2; i++) {
            output[2*i] = this.b0a0*buffer[2*i] + this.b1a0*this.x_1_l + this.b2a0*this.x_2_l - this.a1a0*this.y_1_l - this.a2a0*this.y_2_l;
            this.y_2_l = this.y_1_l;
            this.y_1_l = output[2*i];
            this.x_2_l = this.x_1_l;
            this.x_1_l = buffer[2*i];

            output[2*i+1] = this.b0a0*buffer[2*i+1] + this.b1a0*this.x_1_r + this.b2a0*this.x_2_r - this.a1a0*this.y_1_r - this.a2a0*this.y_2_r;
            this.y_2_r = this.y_1_r;
            this.y_1_r = output[2*i+1];
            this.x_2_r = this.x_1_r;
            this.x_1_r = buffer[2*i+1];
          }

          return output;
      };
    }

    /* 
     *  Magnitude to decibels
     * 
     *  Created by Ricard Marxer <email@ricardmarxer.com> on 2010-05-23.
     *  Copyright 2010 Ricard Marxer. All rights reserved.
     *
     *  @buffer array of magnitudes to convert to decibels
     *
     *  @returns the array in decibels
     *
     */
    DSP.mag2db = function(buffer) {
      var minDb = -120;
      var minMag = Math.pow(10.0, minDb / 20.0);

      var log = Math.log;
      var max = Math.max;
     
      var result = Float32Array(buffer.length);
      for (var i=0; i<buffer.length; i++) {
        result[i] = 20.0*log(max(buffer[i], minMag));
      }

      return result;
    };

    /* 
     *  Frequency response
     * 
     *  Created by Ricard Marxer <email@ricardmarxer.com> on 2010-05-23.
     *  Copyright 2010 Ricard Marxer. All rights reserved.
     *
     *  Calculates the frequency response at the given points.
     *
     *  @b b coefficients of the filter
     *  @a a coefficients of the filter
     *  @w w points (normally between -PI and PI) where to calculate the frequency response
     *
     *  @returns the frequency response in magnitude
     *
     */
    DSP.freqz = function(b, a, w) {
      var i, j;

      if (!w) {
        w = Float32Array(200);
        for (i=0;i<w.length; i++) {
          w[i] = DSP.TWO_PI/w.length * i - Math.PI;
        }
      }

      var result = Float32Array(w.length);
     
      var sqrt = Math.sqrt;
      var cos = Math.cos;
      var sin = Math.sin;
     
      for (i=0; i<w.length; i++) {
        var numerator = {real:0.0, imag:0.0};
        for (j=0; j<b.length; j++) {
          numerator.real += b[j] * cos(-j*w[i]);
          numerator.imag += b[j] * sin(-j*w[i]);
        }

        var denominator = {real:0.0, imag:0.0};
        for (j=0; j<a.length; j++) {
          denominator.real += a[j] * cos(-j*w[i]);
          denominator.imag += a[j] * sin(-j*w[i]);
        }
     
        result[i] =  sqrt(numerator.real*numerator.real + numerator.imag*numerator.imag) / sqrt(denominator.real*denominator.real + denominator.imag*denominator.imag);
      }

      return result;
    };

    /* 
     *  Graphical Equalizer
     *
     *  Implementation of a graphic equalizer with a configurable bands-per-octave
     *  and minimum and maximum frequencies
     * 
     *  Created by Ricard Marxer <email@ricardmarxer.com> on 2010-05-23.
     *  Copyright 2010 Ricard Marxer. All rights reserved.
     *
     */
    function GraphicalEq(sampleRate) {
      this.FS = sampleRate;
      this.minFreq = 40.0;
      this.maxFreq = 16000.0;

      this.bandsPerOctave = 1.0;

      this.filters = [];
      this.freqzs = [];

      this.calculateFreqzs = true;

      this.recalculateFilters = function() {
        var bandCount = Math.round(Math.log(this.maxFreq/this.minFreq) * this.bandsPerOctave/ Math.LN2);

        this.filters = [];
        for (var i=0; i<bandCount; i++) {
          var freq = this.minFreq*(Math.pow(2, i/this.bandsPerOctave));
          var newFilter = new Biquad(DSP.PEAKING_EQ, this.FS);
          newFilter.setDbGain(0);
          newFilter.setBW(1/this.bandsPerOctave);
          newFilter.setF0(freq);
          this.filters[i] = newFilter;
          this.recalculateFreqz(i);
        }
      };

      this.setMinimumFrequency = function(freq) {
        this.minFreq = freq;
        this.recalculateFilters();
      };

      this.setMaximumFrequency = function(freq) {
        this.maxFreq = freq;
        this.recalculateFilters();
      };

      this.setBandsPerOctave = function(bands) {
        this.bandsPerOctave = bands;
        this.recalculateFilters();
      };

      this.setBandGain = function(bandIndex, gain) {
        if (bandIndex < 0 || bandIndex > (this.filters.length-1)) {
          throw "The band index of the graphical equalizer is out of bounds.";
        }

        if (!gain) {
          throw "A gain must be passed.";
        }
       
        this.filters[bandIndex].setDbGain(gain);
        this.recalculateFreqz(bandIndex);
      };
     
      this.recalculateFreqz = function(bandIndex) {
        if (!this.calculateFreqzs) {
          return;
        }

        if (bandIndex < 0 || bandIndex > (this.filters.length-1)) {
          throw "The band index of the graphical equalizer is out of bounds. " + bandIndex + " is out of [" + 0 + ", " + this.filters.length-1 + "]";
        }
           
        if (!this.w) {
          this.w = Float32Array(400);
          for (var i=0; i<this.w.length; i++) {
             this.w[i] = Math.PI/this.w.length * i;
          }
        }
       
        var b = [this.filters[bandIndex].b0, this.filters[bandIndex].b1, this.filters[bandIndex].b2];
        var a = [this.filters[bandIndex].a0, this.filters[bandIndex].a1, this.filters[bandIndex].a2];

        this.freqzs[bandIndex] = DSP.mag2db(DSP.freqz(b, a, this.w));
      };

      this.process = function(buffer) {
        var output = buffer;

        for (var i = 0; i < this.filters.length; i++) {
          output = this.filters[i].process(output);
        }

        return output;
      };

      this.processStereo = function(buffer) {
        var output = buffer;

        for (var i = 0; i < this.filters.length; i++) {
          output = this.filters[i].processStereo(output);
        }

        return output;
      };
    }

    /**
     * MultiDelay effect by Almer Thie (http://code.almeros.com).
     * Copyright 2010 Almer Thie. All rights reserved.
     * Example: http://code.almeros.com/code-examples/delay-firefox-audio-api/
     *
     * This is a delay that feeds it's own delayed signal back into its circular
     * buffer. Also known as a CombFilter.
     *
     * Compatible with interleaved stereo (or more channel) buffers and
     * non-interleaved mono buffers.
     *
     * @param {Number} maxDelayInSamplesSize Maximum possible delay in samples (size of circular buffer)
     * @param {Number} delayInSamples Initial delay in samples
     * @param {Number} masterVolume Initial master volume. Float value: 0.0 (silence), 1.0 (normal), >1.0 (amplify)
     * @param {Number} delayVolume Initial feedback delay volume. Float value: 0.0 (silence), 1.0 (normal), >1.0 (amplify)
     *
     * @constructor
     */
    function MultiDelay(maxDelayInSamplesSize, delayInSamples, masterVolume, delayVolume) {
      this.delayBufferSamples   = new Float32Array(maxDelayInSamplesSize); // The maximum size of delay
      this.delayInputPointer     = delayInSamples;
      this.delayOutputPointer   = 0;
     
      this.delayInSamples   = delayInSamples;
      this.masterVolume     = masterVolume;
      this.delayVolume     = delayVolume;
    }

    /**
     * Change the delay time in samples.
     *
     * @param {Number} delayInSamples Delay in samples
     */
    MultiDelay.prototype.setDelayInSamples = function (delayInSamples) {
      this.delayInSamples = delayInSamples;
     
      this.delayInputPointer = this.delayOutputPointer + delayInSamples;

      if (this.delayInputPointer >= this.delayBufferSamples.length-1) {
        this.delayInputPointer = this.delayInputPointer - this.delayBufferSamples.length; 
      }
    };

    /**
     * Change the master volume.
     *
     * @param {Number} masterVolume Float value: 0.0 (silence), 1.0 (normal), >1.0 (amplify)
     */
    MultiDelay.prototype.setMasterVolume = function(masterVolume) {
      this.masterVolume = masterVolume;
    };

    /**
     * Change the delay feedback volume.
     *
     * @param {Number} delayVolume Float value: 0.0 (silence), 1.0 (normal), >1.0 (amplify)
     */
    MultiDelay.prototype.setDelayVolume = function(delayVolume) {
      this.delayVolume = delayVolume;
    };

    /**
     * Process a given interleaved or mono non-interleaved float value Array and adds the delayed audio.
     *
     * @param {Array} samples Array containing Float values or a Float32Array
     *
     * @returns A new Float32Array interleaved or mono non-interleaved as was fed to this function.
     */
    MultiDelay.prototype.process = function(samples) {
      // NB. Make a copy to put in the output samples to return.
      var outputSamples = new Float32Array(samples.length);

      for (var i=0; i<samples.length; i++) {
        // delayBufferSamples could contain initial NULL's, return silence in that case
        var delaySample = (this.delayBufferSamples[this.delayOutputPointer] === null ? 0.0 : this.delayBufferSamples[this.delayOutputPointer]);
       
        // Mix normal audio data with delayed audio
        var sample = (delaySample * this.delayVolume) + samples[i];
       
        // Add audio data with the delay in the delay buffer
        this.delayBufferSamples[this.delayInputPointer] = sample;
       
        // Return the audio with delay mix
        outputSamples[i] = sample * this.masterVolume;
       
        // Manage circulair delay buffer pointers
        this.delayInputPointer++;
        if (this.delayInputPointer >= this.delayBufferSamples.length-1) {
          this.delayInputPointer = 0;
        }
         
        this.delayOutputPointer++;
        if (this.delayOutputPointer >= this.delayBufferSamples.length-1) {
          this.delayOutputPointer = 0; 
        } 
      }
     
      return outputSamples;
    };

    /**
     * SingleDelay effect by Almer Thie (http://code.almeros.com).
     * Copyright 2010 Almer Thie. All rights reserved.
     * Example: See usage in Reverb class
     *
     * This is a delay that does NOT feeds it's own delayed signal back into its 
     * circular buffer, neither does it return the original signal. Also known as
     * an AllPassFilter(?).
     *
     * Compatible with interleaved stereo (or more channel) buffers and
     * non-interleaved mono buffers.
     *
     * @param {Number} maxDelayInSamplesSize Maximum possible delay in samples (size of circular buffer)
     * @param {Number} delayInSamples Initial delay in samples
     * @param {Number} delayVolume Initial feedback delay volume. Float value: 0.0 (silence), 1.0 (normal), >1.0 (amplify)
     *
     * @constructor
     */

    function SingleDelay(maxDelayInSamplesSize, delayInSamples, delayVolume) {
      this.delayBufferSamples = new Float32Array(maxDelayInSamplesSize); // The maximum size of delay
      this.delayInputPointer  = delayInSamples;
      this.delayOutputPointer = 0;
     
      this.delayInSamples     = delayInSamples;
      this.delayVolume        = delayVolume;
    }

    /**
     * Change the delay time in samples.
     *
     * @param {Number} delayInSamples Delay in samples
     */
    SingleDelay.prototype.setDelayInSamples = function(delayInSamples) {
      this.delayInSamples = delayInSamples;
      this.delayInputPointer = this.delayOutputPointer + delayInSamples;

      if (this.delayInputPointer >= this.delayBufferSamples.length-1) {
        this.delayInputPointer = this.delayInputPointer - this.delayBufferSamples.length; 
      }
    };

    /**
     * Change the return signal volume.
     *
     * @param {Number} delayVolume Float value: 0.0 (silence), 1.0 (normal), >1.0 (amplify)
     */
    SingleDelay.prototype.setDelayVolume = function(delayVolume) {
      this.delayVolume = delayVolume;
    };

    /**
     * Process a given interleaved or mono non-interleaved float value Array and
     * returns the delayed audio.
     *
     * @param {Array} samples Array containing Float values or a Float32Array
     *
     * @returns A new Float32Array interleaved or mono non-interleaved as was fed to this function.
     */
    SingleDelay.prototype.process = function(samples) {
      // NB. Make a copy to put in the output samples to return.
      var outputSamples = new Float32Array(samples.length);

      for (var i=0; i<samples.length; i++) {

        // Add audio data with the delay in the delay buffer
        this.delayBufferSamples[this.delayInputPointer] = samples[i];
       
        // delayBufferSamples could contain initial NULL's, return silence in that case
        var delaySample = this.delayBufferSamples[this.delayOutputPointer];

        // Return the audio with delay mix
        outputSamples[i] = delaySample * this.delayVolume;

        // Manage circulair delay buffer pointers
        this.delayInputPointer++;

        if (this.delayInputPointer >= this.delayBufferSamples.length-1) {
          this.delayInputPointer = 0;
        }
         
        this.delayOutputPointer++;

        if (this.delayOutputPointer >= this.delayBufferSamples.length-1) {
          this.delayOutputPointer = 0; 
        } 
      }
     
      return outputSamples;
    };

    /**
     * Reverb effect by Almer Thie (http://code.almeros.com).
     * Copyright 2010 Almer Thie. All rights reserved.
     * Example: http://code.almeros.com/code-examples/reverb-firefox-audio-api/
     *
     * This reverb consists of 6 SingleDelays, 6 MultiDelays and an IIRFilter2
     * for each of the two stereo channels.
     *
     * Compatible with interleaved stereo buffers only!
     *
     * @param {Number} maxDelayInSamplesSize Maximum possible delay in samples (size of circular buffers)
     * @param {Number} delayInSamples Initial delay in samples for internal (Single/Multi)delays
     * @param {Number} masterVolume Initial master volume. Float value: 0.0 (silence), 1.0 (normal), >1.0 (amplify)
     * @param {Number} mixVolume Initial reverb signal mix volume. Float value: 0.0 (silence), 1.0 (normal), >1.0 (amplify)
     * @param {Number} delayVolume Initial feedback delay volume for internal (Single/Multi)delays. Float value: 0.0 (silence), 1.0 (normal), >1.0 (amplify)
     * @param {Number} dampFrequency Initial low pass filter frequency. 0 to 44100 (depending on your maximum sampling frequency)
     *
     * @constructor
     */
    function Reverb(maxDelayInSamplesSize, delayInSamples, masterVolume, mixVolume, delayVolume, dampFrequency) {
      this.delayInSamples   = delayInSamples;
      this.masterVolume     = masterVolume;
      this.mixVolume       = mixVolume;
      this.delayVolume     = delayVolume;
      this.dampFrequency     = dampFrequency;
     
      this.NR_OF_MULTIDELAYS = 6;
      this.NR_OF_SINGLEDELAYS = 6;
     
      this.LOWPASSL = new IIRFilter2(DSP.LOWPASS, dampFrequency, 0, 44100);
      this.LOWPASSR = new IIRFilter2(DSP.LOWPASS, dampFrequency, 0, 44100);
     
      this.singleDelays = [];
      
      var i, delayMultiply;

      for (i = 0; i < this.NR_OF_SINGLEDELAYS; i++) {
        delayMultiply = 1.0 + (i/7.0); // 1.0, 1.1, 1.2...
        this.singleDelays[i] = new SingleDelay(maxDelayInSamplesSize, Math.round(this.delayInSamples * delayMultiply), this.delayVolume);
      }
     
      this.multiDelays = [];

      for (i = 0; i < this.NR_OF_MULTIDELAYS; i++) {
        delayMultiply = 1.0 + (i/10.0); // 1.0, 1.1, 1.2... 
        this.multiDelays[i] = new MultiDelay(maxDelayInSamplesSize, Math.round(this.delayInSamples * delayMultiply), this.masterVolume, this.delayVolume);
      }
    }

    /**
     * Change the delay time in samples as a base for all delays.
     *
     * @param {Number} delayInSamples Delay in samples
     */
    Reverb.prototype.setDelayInSamples = function (delayInSamples){
      this.delayInSamples = delayInSamples;

      var i, delayMultiply;
     
      for (i = 0; i < this.NR_OF_SINGLEDELAYS; i++) {
        delayMultiply = 1.0 + (i/7.0); // 1.0, 1.1, 1.2...
        this.singleDelays[i].setDelayInSamples( Math.round(this.delayInSamples * delayMultiply) );
      }
       
      for (i = 0; i < this.NR_OF_MULTIDELAYS; i++) {
        delayMultiply = 1.0 + (i/10.0); // 1.0, 1.1, 1.2...
        this.multiDelays[i].setDelayInSamples( Math.round(this.delayInSamples * delayMultiply) );
      }
    };

    /**
     * Change the master volume.
     *
     * @param {Number} masterVolume Float value: 0.0 (silence), 1.0 (normal), >1.0 (amplify)
     */
    Reverb.prototype.setMasterVolume = function (masterVolume){
      this.masterVolume = masterVolume;
    };

    /**
     * Change the reverb signal mix level.
     *
     * @param {Number} mixVolume Float value: 0.0 (silence), 1.0 (normal), >1.0 (amplify)
     */
    Reverb.prototype.setMixVolume = function (mixVolume){
      this.mixVolume = mixVolume;
    };

    /**
     * Change all delays feedback volume.
     *
     * @param {Number} delayVolume Float value: 0.0 (silence), 1.0 (normal), >1.0 (amplify)
     */
    Reverb.prototype.setDelayVolume = function (delayVolume){
      this.delayVolume = delayVolume;
     
      var i;

      for (i = 0; i<this.NR_OF_SINGLEDELAYS; i++) {
        this.singleDelays[i].setDelayVolume(this.delayVolume);
      } 
     
      for (i = 0; i<this.NR_OF_MULTIDELAYS; i++) {
        this.multiDelays[i].setDelayVolume(this.delayVolume);
      } 
    };

    /**
     * Change the Low Pass filter frequency.
     *
     * @param {Number} dampFrequency low pass filter frequency. 0 to 44100 (depending on your maximum sampling frequency)
     */
    Reverb.prototype.setDampFrequency = function (dampFrequency){
      this.dampFrequency = dampFrequency;
     
      this.LOWPASSL.set(dampFrequency, 0);
      this.LOWPASSR.set(dampFrequency, 0); 
    };

    /**
     * Process a given interleaved float value Array and copies and adds the reverb signal.
     *
     * @param {Array} samples Array containing Float values or a Float32Array
     *
     * @returns A new Float32Array interleaved buffer.
     */
    Reverb.prototype.process = function (interleavedSamples){ 
      // NB. Make a copy to put in the output samples to return.
      var outputSamples = new Float32Array(interleavedSamples.length);
     
      // Perform low pass on the input samples to mimick damp
      var leftRightMix = DSP.deinterleave(interleavedSamples);
      this.LOWPASSL.process( leftRightMix[DSP.LEFT] );
      this.LOWPASSR.process( leftRightMix[DSP.RIGHT] ); 
      var filteredSamples = DSP.interleave(leftRightMix[DSP.LEFT], leftRightMix[DSP.RIGHT]);

      var i;

      // Process MultiDelays in parallel
      for (i = 0; i<this.NR_OF_MULTIDELAYS; i++) {
        // Invert the signal of every even multiDelay
        outputSamples = DSP.mixSampleBuffers(outputSamples, this.multiDelays[i].process(filteredSamples), 2%i === 0, this.NR_OF_MULTIDELAYS);
      }
     
      // Process SingleDelays in series
      var singleDelaySamples = new Float32Array(outputSamples.length);
      for (i = 0; i<this.NR_OF_SINGLEDELAYS; i++) {
        // Invert the signal of every even singleDelay
        singleDelaySamples = DSP.mixSampleBuffers(singleDelaySamples, this.singleDelays[i].process(outputSamples), 2%i === 0, 1);
      }

      // Apply the volume of the reverb signal
      for (i = 0; i<singleDelaySamples.length; i++) {
        singleDelaySamples[i] *= this.mixVolume;
      }
     
      // Mix the original signal with the reverb signal
      outputSamples = DSP.mixSampleBuffers(singleDelaySamples, interleavedSamples, 0, 1);

      // Apply the master volume to the complete signal
      for (i = 0; i<outputSamples.length; i++) {
        outputSamples[i] *= this.masterVolume;
      }
       
      return outputSamples;
    };

}(this));

function PhaseVocoder(winSize, sampleRate) {

    var _sampleRate = sampleRate; var _Hs = 0; var _Ha = 0; var _omega;

    var _previousInputPhase; var _previousOutputPhase; var _framingWindow;
    
    var _squaredFramingWindow; var _winSize = winSize;

    var _overlapBuffers; var _owOverlapBuffers;

    var _first = true;

    var _overlapFactor = 4;

    var _lastInputAlpha = 1;

    /*****************************************************/
    /******************* dsp.js FFT **********************/
    /*****************************************************/

    var fft = new FFT(_winSize, sampleRate);
    /*****************************************************/
    /*****************************************************/
    /*****************************************************/


    var sqrt = Math.sqrt; var cos = Math.cos;
    var sin = Math.sin; var atan2 = Math.atan2;
    var round = Math.round; var max = Math.max;
    var ceil = Math.ceil; var pow = Math.pow;
    var PI = Math.PI;


    /*****************************************************/
    /***************PRE-ALLOCATE MEMORY*******************/
    /*****************************************************/

    //find_peaks
    var _hlfSize = round(_winSize/2)+1;

    // // process
    var _process = {
        fftObj : {
            real: new Float32Array(_hlfSize), 
            imag: new Float32Array(_hlfSize), 
            magnitude: new Float32Array(_hlfSize), 
            phase: new Float32Array(_hlfSize)
        }, 
        pvOut : {
            real: create_constant_array(_winSize, 0, Float32Array), 
            imag: create_constant_array(_winSize, 0, Float32Array), 
            magnitude: create_constant_array(_winSize, 0, Float32Array), 
            phase: create_constant_array(_winSize, 0, Float32Array)
        },
        processedFrame : new Float32Array(_winSize)
    };

    var _pv_step = {
        instPhaseAdv : new Float32Array(_hlfSize), 
        phTh : new Float32Array(_hlfSize)
    };

    var _STFT = {
        _inputFrame : new Float32Array(_winSize),
        _zeros: new Float32Array(_winSize)
    }
    /*****************************************************/
    /*****************************************************/
    /*****************************************************/

    var phTh_idx = 0;
    var twoPI = 2 * PI;
    var expectedPhaseAdv, auxHeterodynedPhaseIncr, heterodynedPhaseIncr, 
        instPhaseAdvPerSampleHop, instPhaseAdv_, prevInstPhaseAdv_;
    
    function overlap_and_slide(Hs, inF, squaredWinF, oBuf, owOBuf, windowSize, outF) {

        var owSample, oSample = 0;

        for (var i = 0; i < Hs; i++) {
          owSample = owOBuf.shift() || 0;
          oSample  = oBuf.shift() || 0;
          outF.push(oSample / ((owSample<10e-3)? 1 : owSample));
          oBuf.push(0);
          owOBuf.push(0);
        }

        for (var i = 0; i < windowSize; i++) {
          oSample = oBuf.shift();
          oBuf.push(inF[i] + oSample);
          owSample = owOBuf.shift();
          owOBuf.push(squaredWinF[i] + owSample);
        }
    }


    function pv_step(fftObj, prevInPh, prevOutPh, omega, Ha, Hs, out) {

        var currInPh = fftObj.phase;
        var mag = fftObj.magnitude;
        var instPhaseAdv = _pv_step.instPhaseAdv;
        var phTh = _pv_step.phTh;

        var peak, prevPeak, reg, regStart, prevRegEnd, prevRegStart, d, i;
        phTh_idx = 0;

        for (i = 0; i < omega.length; i++) {
            expectedPhaseAdv = omega[i] * Ha;

            auxHeterodynedPhaseIncr = (currInPh[i] - prevInPh[i]) - expectedPhaseAdv;
            heterodynedPhaseIncr = auxHeterodynedPhaseIncr - twoPI * round(auxHeterodynedPhaseIncr/twoPI);

            instPhaseAdvPerSampleHop = omega[i] + heterodynedPhaseIncr / Ha;

            instPhaseAdv_ = instPhaseAdvPerSampleHop * Hs;

            if (mag[i] > max((mag[i-2]|0), (mag[i-1]|0), (mag[i+1]|0), (mag[i+2]|0))) {
            // if (mag[i] > (mag[i-2]|0) && mag[i] > (mag[i-1]|0) && mag[i] > (mag[i+1]|0) && mag[i] > (mag[i+2]|0)) {
                peak = i;
                regStart = ceil((prevPeak + peak)/2) | 0; 
                prevRegEnd = regStart-1;
                reg = max(0, prevRegEnd - prevRegStart + 1);
                prevRegStart = regStart;
                for (d = 0; d < reg; d++, phTh_idx++) {
                    phTh[phTh_idx] = prevOutPh[prevPeak] + prevInstPhaseAdv_ - currInPh[prevPeak];
                }
                prevPeak = peak;
                prevInstPhaseAdv_ = instPhaseAdv_;
            }
        }
        
        for (var i=0; i<phTh.length; i++) {
            var theta = phTh[i];

            var phThRe = cos(phTh[i]);
            var phThIm = sin(phTh[i]);
            
            out.real[i] = phThRe * fftObj.real[i] - phThIm * fftObj.imag[i];
            out.imag[i] = phThRe * fftObj.imag[i] + phThIm * fftObj.real[i];
            out.phase[i] = atan2(out.imag[i], out.real[i]);
        }
        
        return;
    }


    this.process = function(inputArray, outputArray) {

        var _ = this;

        var __Hs = _Hs;
        var __Ha = _Ha;

        // ----------------------------------
        // ----------ANALYSIS STEP-----------
        // ----------------------------------
        
        var processedFrame = _process.processedFrame;;
        var fftObj = _process.fftObj;
        // FOR SOME REASON, IF I DON'T CREATE A NEW "phase" ARHaY, I GET ARTIFACTS.
        // fftObj.phase = new Float32Array(_hlfSize); 
        var pvOut = _process.pvOut;
        _.STFT(inputArray, _framingWindow, _hlfSize, fftObj);
        pv_step(fftObj, _previousInputPhase, _previousOutputPhase, _omega, __Ha, __Hs, pvOut);
        _previousOutputPhase = pvOut.phase;
        // The "phase" issue mentioned above is related to this line. 
        // If I create a new Float array using the phase array, I get no issues.
        _previousInputPhase = new Float32Array(fftObj.phase); 
        _.ISTFT(pvOut.real, pvOut.imag, _framingWindow, false, processedFrame);


        // ----------------------------------
        // ------OVERLAP AND SLIDE STEP------
        // ----------------------------------
        // var outputFrame = new Array(__Hs);

        overlap_and_slide(__Hs, processedFrame, _squaredFramingWindow, _overlapBuffers, _owOverlapBuffers, _winSize, outputArray);

        return __Hs;

    }

    
    this.STFT = function(inputFrame, windowFrame, wantedSize, out) {
        this.STFT_drom(inputFrame, windowFrame, wantedSize, out);
    }

    this.STFT_drom = function(inputFrame, windowFrame, wantedSize, out) {
        var winSize = windowFrame.length;
        var _inputFrame = _STFT._inputFrame;

        for (var i=0; i<winSize; i++) {
            _inputFrame[i] = inputFrame[i] * windowFrame[i];
        }
        
        fft.forward(_inputFrame);
        out.real = fft.real;
        out.imag = fft.imag;
        
        var R = out.real; var I = out.imag;
        var P = out.phase; var M = out.magnitude;

        for (var p=0; p<winSize && p<wantedSize; p++) { 
            M[p] = sqrt(I[p]*I[p] + R[p]*R[p]) * 1000;
            P[p] = atan2(I[p], R[p]);
        }

        return;
    }



    this.ISTFT = function(real, imag, windowFrame, restoreEnergy, timeFrame) {
        this.ISTFT_drom(real, imag, windowFrame, restoreEnergy, timeFrame);
    }

    this.ISTFT_drom = function(real, imag, windowFrame, restoreEnergy, timeFrame) {

        fft.inverse(real, imag, timeFrame);

        return;

    }



    this.init = function() {

        _omega = create_omega_array(winSize);

        this.reset_phases_and_overlap_buffers();

        _framingWindow = create_sin_beta_window_array(winSize, 1);

        _squaredFramingWindow = _framingWindow.map(function(x,i){ return x*x; });

        this.set_alpha(1);
    }

    function create_omega_array(size) {
        return Array.apply(null, Array(size/2 + 1)).map(function (x, i) { 
            return twoPI * i / size;
        });
    }
    
    function create_sin_beta_window_array(size, beta) {
        return Array.apply(null, Array(size)).map(function(x,i){
            return pow(sin(PI * i / size), beta);
        });
    }

    function create_constant_array(size, constant, ArrayType) {
        var arr = new ((ArrayType)?ArrayType:Array)(size);
        for (var i=0; i<size; i++) 
            arr[i] = constant;
        return arr;
    }

    this.reset_phases_and_overlap_buffers = function() {

        _previousInputPhase = create_constant_array(winSize/2, 0);
        _previousOutputPhase = create_constant_array(winSize/2, 0);

        _overlapBuffers = new CBuffer(winSize);
        _owOverlapBuffers = new CBuffer(winSize);
        for (var i=0; i < winSize; i++) {
            _overlapBuffers.push(0);
            _owOverlapBuffers.push(0);
        }

        _first = true;
    }

    this.reset_phases = function() {

        _previousInputPhase = create_constant_array(winSize/2, 0);
        _previousOutputPhase = create_constant_array(winSize/2, 0);

        _first = true;
    }


    this.get_previous_input_phase = function() {
        return _previousInputPhase;
    }

    this.get_previous_output_phase = function() {
        return _previousOutputPhase;
    }

    this.get_analysis_hop = function() {
        return _Ha;
    }

    this.get_synthesis_hop = function() {
        return _Hs;
    }

    this.get_alpha = function() {
        return _Hs / _Ha;
    }

    this.get_framing_window = function() {
        return _framingWindow;
    }

    this.get_squared_framing_window = function() {
        return _squaredFramingWindow;
    }

    this.set_alpha = function(newAlpha) {
        _lastInputAlpha = newAlpha;
        if (newAlpha <= 0.8)
            _overlapFactor = 2;
        else if (newAlpha <= 1)
            _overlapFactor = 4;
        else
            _overlapFactor = 5;

        /* "Fixed" synthesis hop size. */
        _Ha = round(_winSize/_overlapFactor);
        _Hs = round(newAlpha * _Ha);
        
        // _Hs = _Ha;

        // _Hs = round(_winSize/2);
        // _Ha = round(_Hs / newAlpha);
    }

    this.get_alpha_step = function() {
        return 1/_Ha;
    }

    this.set_hops = function(Ha, Hs) {
        _Ha = Ha;
        _Hs = Hs;
    }

    this.get_specified_alpha = function() {
        return _lastInputAlpha;
    }

    this.set_overlap_factor = function(overlapFactor) {
        _overlapFactor = overlapFactor;
        this.set_alpha(_lastInputAlpha);
    }
}

export function BufferedPV(frameSize) {

    var _frameSize = frameSize || 4096;
    var _pvL = new PhaseVocoder(_frameSize, 44100); _pvL.init();
    var _pvR = new PhaseVocoder(_frameSize, 44100); _pvR.init();
    var _buffer;
    var _position = 0;
    var _newAlpha = 1;

    var _midBufL = new CBuffer(Math.round(_frameSize * 2));
    var _midBufR = new CBuffer(Math.round(_frameSize * 2));

    

    this.process = function(outputAudioBuffer) {

        if (!_buffer) 
            return;

        var sampleCounter = 0;

        var il = _buffer.getChannelData(0);
        var ir = _buffer.getChannelData(0);
        var ol = outputAudioBuffer.getChannelData(0);
        var or = outputAudioBuffer.getChannelData(1);


        while (_midBufR.size > 0 && sampleCounter < outputAudioBuffer.length) {
          var i = sampleCounter++;
          ol[i] = _midBufL.shift();
          or[i] = _midBufR.shift();
        }

        if (sampleCounter == outputAudioBuffer.length)
          return;

        do {

          var bufL = il.subarray(_position, _position + _frameSize);
          var bufR = ir.subarray(_position, _position + _frameSize);

          if (_newAlpha != undefined && _newAlpha != _pvL.get_alpha()) {
            _pvL.set_alpha(_newAlpha);
            _pvR.set_alpha(_newAlpha);
            _newAlpha = undefined;
          }


          /* LEFT */
          _pvL.process(bufL, _midBufL);
          _pvR.process(bufR, _midBufR);
          for (var i=sampleCounter; _midBufL.size > 0 && i < outputAudioBuffer.length; i++) {
            ol[i] = _midBufL.shift();
            or[i] = _midBufR.shift();
          }

          sampleCounter += _pvL.get_synthesis_hop();

          _position
           += _pvL.get_analysis_hop();

        } while (sampleCounter < outputAudioBuffer.length);
    }

    this.set_audio_buffer = function(newBuffer) {
        _buffer = newBuffer;
        _position = 0;
        _newAlpha = 1;
    }

    Object.defineProperties(this, {
        'position' : {
            get : function() {
                return _position;
            }, 
            set : function(newPosition) {
                _position = newPosition;
            }
        }, 
        'alpha' : {
            get : function() {
                return _pvL.get_alpha();
            }, 
            set : function(newAlpha) {
                _newAlpha = newAlpha;
            }
        }
    });
}

export function WAAPlayer(audioContext, audioBuffer, frameSize, bufferSize) {

  var _audioCtx = audioContext;

  var _node = audioContext.createScriptProcessor(bufferSize, 2);
  
  var _pv = new BufferedPV(frameSize);

  var _audioBuffer = audioBuffer;

  _pv.set_audio_buffer(audioBuffer);

  var _newAlpha = 1;

  var _newPosition = 0;

  var _canPlay = false;



  _node.onaudioprocess = function(e) {
    if (_canPlay) {
      if (_newAlpha != undefined) {
        _pv.alpha = _newAlpha;
        _newAlpha = undefined;
      }

      if (_newPosition != undefined) {
        _pv.position = _newPosition;
        _newPosition = undefined;
      }

      _pv.process(e.outputBuffer);
    } 
  }

  this.play = function() {
    _canPlay = true;
  }

  this.stop = function() {
    _canPlay = false;
  }

  this.connect = function(destination) {
    _node.connect(destination);
  }

  this.disconnect = function() {
    _node.disconnect();
  }

  Object.defineProperties(this, {
    'position' : {
      get : function() {
        return _newPosition || _pv.position;
      }, 
      set : function(newPosition) {
        _newPosition = newPosition;
      }
    },
    'speed' : {
      get : function() {
        return _newAlpha || _pv.alpha;
      },
      set : function(newSpeed) {
        _newAlpha = newSpeed;
      }
    },
    'context' : {
      get : function() {
        return _audioCtx;
      }
    },
    'audioBuffer' : {
      get : function() {
        return _audioBuffer;
      }
    }
  })
}

export function WAAPlayerUI(id, title, player, gain, recorder) {

    /*
     *  COMPONENTES: 
     *      (1) SLIDER PARA A VELOCIDADE.
     *      (2) SLIDER PARA O GANHO.
     *      (3) WAVEFORM
     *      (4) BOTÃO PARA ELIMINAR O PLAYER
     *      (5) BOTÃO PARA STOP
     *      (6) BOTÃO PARA PLAY
     *      (7) TÍTULO
     */

    var _playerId = id;
    var _player = player;
    var _gain = gain;
    var _title = title;
    var _that = this;
    var _recorder = recorder;


    /*************** MAIN DIV ******************/
    var _playerDiv = document.createElement('div');
    _playerDiv.id = 'player-' + _playerId;
    _playerDiv.classList.add('player-container');
    /*******************************************/


    /*********** TEMPO INPUT SLIDER ************/
    var _tempoSlider = document.createElement('input');
    _tempoSlider.id = 'tempo-control-' + _playerId;
    _tempoSlider.name = _tempoSlider.id;
    _tempoSlider.type = 'range';
    _tempoSlider.max = 2;
    _tempoSlider.min = 0.5;
    _tempoSlider.step = 0.01;
    _player.speed = 1;
    
    var _tempoSliderLabel = document.createElement('label');
    _tempoSliderLabel.for = _tempoSlider.id;
    _tempoSliderLabel.innerHTML = 'Tempo: ';

    var _tempoValue = document.createElement('span');
    _tempoValue.id = 'tempo-value-' + _playerId;
    _tempoValue.innerHTML = _player.speed;

    _tempoSlider.oninput = function() {
        _player.speed = document.getElementById('tempo-control-' + _playerId).value;
        _tempoValue.innerHTML = _player.speed;
    };

    var _tempoDiv = document.createElement('div');
    /*******************************************/


    /*********** GAIN INPUT SLIDER *************/
    var _gainSlider = document.createElement('input');
    _gainSlider.id = 'gain-control-' + _playerId;
    _gainSlider.name = _gainSlider.id;
    _gainSlider.type = 'range';
    _gainSlider.value = 1;
    _gainSlider.max = 1.5;
    _gainSlider.min = 0;
    _gainSlider.step = 0.01;
    _gain.gain.value = 1;
    
    var _gainSliderLabel = document.createElement('label');
    _gainSliderLabel.for = _gainSlider.id;
    _gainSliderLabel.innerHTML = 'Volume: ';

    var _gainValue = document.createElement('span');
    _gainValue.id = 'gain-value-' + _playerId;
    _gainValue.innerHTML = _gain.gain.value;

    _gainSlider.oninput = function() {
        _gain.gain.value = document.getElementById('gain-control-' + _playerId).value;
        _gainValue.innerHTML = _gain.gain.value;
    };

    var _gainDiv = document.createElement('div');
    /***********************************************/


    /**************** PLAY BUTTON ******************/
    var _playButton = document.createElement('button');
    _playButton.innerHTML = "Play";
    _playButton.onclick = function() {
        _player.play();
    };
    /***********************************************/

    /**************** STOP BUTTON ******************/
    var _stopButton = document.createElement('button');
    _stopButton.innerHTML = "Stop";
    _stopButton.onclick = function() {
        _player.stop();
    }
    /***********************************************/

    /*************** CLOSE BUTTON ******************/
    var _closeButton = document.createElement('button');
    _closeButton.innerHTML = "Close";
    _closeButton.onclick = function() {
        _playerDiv.remove();
        _that.removeCallback();
    }
    /***********************************************/

    /*************** RECORD BUTTON *****************/
    var _recordButton = document.createElement('button');
    var _isRecording = false;
    _recordButton.innerHTML = "Start Record";
    _recordButton.onclick = function() {
        if (_isRecording) {
            _recordButton.innerHTML = "Start Record";
            _isRecording = false;
            recorder.stop();
            recorder.exportWAV(function(blob) {
                var url = URL.createObjectURL(blob);
                window.open(url);
            });
        } else {
            _recordButton.innerHTML = "Stop Record";
            _isRecording = true;
            recorder.record();
        }
    }
    /***********************************************/


    /****************** WAVEFORM *******************/
    
    /***********************************************/



    /****************** TITLE **********************/
    var _titleEl = document.createElement('span');
    _titleEl.innerHTML = _title;
    /***********************************************/


    _tempoDiv.appendChild(_tempoSliderLabel);
    _tempoDiv.appendChild(_tempoSlider);
    _tempoDiv.appendChild(_tempoValue);

    _gainDiv.appendChild(_gainSliderLabel);
    _gainDiv.appendChild(_gainSlider);
    _gainDiv.appendChild(_gainValue);

    _playerDiv.appendChild(_titleEl);
    _playerDiv.appendChild(_tempoDiv);
    _playerDiv.appendChild(_gainDiv);
    _playerDiv.appendChild(_playButton);
    _playerDiv.appendChild(_stopButton);
    _playerDiv.appendChild(_closeButton);
    _playerDiv.appendChild(_recordButton);

    document.body.appendChild(_playerDiv);

    _tempoSlider.value = 1;




    
    this.removeCallback = function() { }


}


export function DragAndDrop(domElement) {

    var _toggleActive = function (e, toggle) {
        e.stopPropagation();
        e.preventDefault();
    };

    var _callbacks =  {};

    var _handlers = {
        drop : function(e) {
            _toggleActive(e, false);
            _emit('drop', e);
        },

        dragover : function(e) {
            _toggleActive(e, true);
            _emit('dragover', e);
        },

        dragleave : function(e) {
            _toggleActive(e, false);
            _emit('dragleave', e);
        }
    };

    var _dropTarget = domElement;
    

    this.on = function(eventType, callback) {
        _callbacks[eventType] = (_callbacks[eventType])? _callbacks[eventType] : {};
        _callbacks[eventType][callback] = callback;
    }

    this.off = function(eventType, callback) {
        if (_callbacks[eventType])
            delete _callbacks[eventType][callback];
    }

    var _emit = function(eventType, data) {
        for (var ci in _callbacks[eventType]) 
            _callbacks[eventType][ci](data);
    }


    document.addEventListener('DOMContentLoaded', function () {
        Object.keys(_handlers).forEach(function (event) {
            _dropTarget.addEventListener(event, _handlers[event]);
        });
    })

}
