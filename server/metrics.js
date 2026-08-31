const startedAt=Date.now();
const counters={httpRequests:0,httpErrors:0};
const statusCounts=new Map();

export function observeHttp(statusCode){counters.httpRequests++;if(statusCode>=400)counters.httpErrors++;statusCounts.set(statusCode,(statusCounts.get(statusCode)||0)+1);}
export function metricsSnapshot(extra={}){return {startedAt:new Date(startedAt).toISOString(),uptimeSeconds:Math.floor((Date.now()-startedAt)/1000),...counters,statusCodes:Object.fromEntries(statusCounts),memory:{rss:process.memoryUsage().rss,heapUsed:process.memoryUsage().heapUsed},...extra};}
