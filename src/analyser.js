import WAAClock from 'waaclock';

/**
 * Every 0.4 seconds, analyse the next 32768 frames (~0.7 seconds)
 * 
 * @param  {AudioContext} context
 * @return {object} Object with the AnalyserNode, and functions to stop and start the analysis
 */
export const analyser = (context) => {
    const node = context.createAnalyser();
    const clock = new WAAClock(context);
    let updateTask;

    node.fftSize = 32768;

    const update = () => {
        // const dataArray = new Uint8Array(node.frequencyBinCount);
        // node.getByteFrequencyData(dataArray);
        
        // console.log(dataArray);
    };

    const start = () => {
        // updateTask = clock.setTimeout(() => {
        //     console.log('update yo!');
        //     update();
        // }, 0).repeat(0.4);
        // console.log(updateTask);
    };

    const stop = () => {
        // if(updateTask) {
        //     updateTask.clear();
        // }
    };

    return {
        node,
        start,
        stop
    };
};
