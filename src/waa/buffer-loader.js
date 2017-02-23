/**
 * Load an audio URL source into an AudioBuffer
 * 
 * @param  {AudioContext} context
 * @param  {string} url
 * @param  {function} progress - Optional callback function to monitor XHR progress
 * @return {AudioBuffer}
 */
const bufferLoader = (context, url, progress) => {
    return new Promise((resolve, reject) => {
        const request = new XMLHttpRequest();
        request.open('GET', url, true);
        request.responseType = 'arraybuffer';
        request.onload = () => {
            context.decodeAudioData(request.response, buffer => resolve(buffer));
        };

        request.onprogress = oEvent => {
            if(oEvent.lengthComputable && progress) {
                progress(oEvent.loaded, oEvent.total);
            }
        };

        request.onerror = err => reject(err);

        request.send();
    });
};

export default bufferLoader;
