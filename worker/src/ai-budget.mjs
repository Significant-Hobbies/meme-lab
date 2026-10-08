export class BudgetUnavailableError extends Error {
  constructor() { super('Shared inference budget is unavailable or exhausted.'); }
}

async function reserve(env,path,amount,periodKey) {
  try {
    const ns=env.NEURON_BUDGET;
    if(!ns||!Number.isSafeInteger(amount)||amount<1) throw new Error();
    const response=await ns.get(ns.idFromName('global-budget')).fetch(`https://internal.local/${path}`,{
      method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(path==='try-debit'?{neurons:amount}:{dimensions:amount})
    });
    if(!response.ok) throw new Error();
    const result=await response.json();
    const key=path==='try-debit'?'dayKey':'monthKey';
    const cap=path==='try-debit'?9500:45_000_000;
    if(result.allowed!==true||result[key]!==periodKey||result.retryAfter!==0||!Number.isSafeInteger(result.used)||result.used<amount||!Number.isSafeInteger(result.remaining)||result.remaining<0||result.used+result.remaining!==cap||(path==='try-debit-vectorize'&&result.baselineVerified!==true)) throw new Error();
  } catch { throw new BudgetUnavailableError(); }
}

export async function reserveRetrievalBudget(env,comment) {
  const now=new Date().toISOString();
  // Reserve all five possible 768-dimensional queries, including the legacy
  // metadata fallback. Never refund failed work: that keeps admission conservative.
  await reserve(env,'try-debit-vectorize',5*768,now.slice(0,7));
  // UTF-8 bytes upper-bound text tokens; include special-token framing and a
  // 20% margin over bge-base's published 6,058 neurons per million input tokens.
  const neurons=Math.ceil((new TextEncoder().encode(comment).length+32)*6058/1_000_000*1.2);
  await reserve(env,'try-debit',neurons,now.slice(0,10));
}
