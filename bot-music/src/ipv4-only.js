import { lookup as dnsLookup } from "node:dns";
import { setGlobalDispatcher, Agent } from "undici";

const ipv4Lookup = (hostname, options, callback) =>
  dnsLookup(hostname, { ...options, family: 4 }, callback);

setGlobalDispatcher(
  new Agent({ connect: { lookup: ipv4Lookup, autoSelectFamily: false } }),
);
