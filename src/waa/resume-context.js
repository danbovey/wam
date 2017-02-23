const resumeContext = context => {
    if(context.state === 'suspended' && typeof context.resume === 'function') {
        context.resume();
    }
};

export default resumeContext;
