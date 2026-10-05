// One deadline for the whole classifier pipeline, including fallback passes.
export function withClassifierDeadline(fetchImpl,timeoutMs) {
  const deadline=AbortSignal.timeout(timeoutMs);
  return async(url,init={})=>{
    const signal=init.signal?AbortSignal.any([deadline,init.signal]):deadline;
    signal.throwIfAborted();
    return fetchImpl(url,{...init,signal});
  };
}
