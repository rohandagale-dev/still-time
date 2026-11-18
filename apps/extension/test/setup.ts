// Deterministic local time for date-boundary tests. New York observes DST, which exercises the
// 23- and 25-hour days that naive "+86_400_000 ms" arithmetic gets wrong.
process.env.TZ = 'America/New_York';
