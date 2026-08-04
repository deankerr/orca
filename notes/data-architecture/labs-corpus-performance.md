# Labs corpus build performance investigation

Date: 2026-08-04  
Machine: Apple Silicon Mac with 16 GiB unified memory  
Runtime: Bun 1.3.14

## Finding

The severe whole-system impact is primarily memory-pressure-induced virtual-memory I/O, not corpus
output throughput. Large crawl shards create a much larger allocation working set than their final
compressed files suggest. macOS responds with compression, reclamation, and swap traffic, which
makes the workload look like a disk bottleneck and affects unrelated applications.

The experiment did not find evidence that XProtect or another security scanner was the principal
cause. Filesystem security interception remains possible, but it is not needed to explain the
observed behavior.

## Instrumented experiment

The diagnostic build selected 2,048 crawls in eight intended 256-crawl shards:

- 768 crawls from the beginning of the snapshot history
- 768 crawls beginning around 2026-02-01
- 512 crawls beginning around 2026-07-01

Command:

```bash
bun --cpu-prof --cpu-prof-md \
  --cpu-prof-dir=/tmp \
  --cpu-prof-name=orca-labs-corpus-2048.cpuprofile \
  apps/labs/src/bin.ts corpus build \
  --input .labs-work/snapshot \
  --output /tmp/orca-labs-corpus-profile-2048 \
  --compression-level 1 \
  --jobs 4 \
  --shard-size 256 \
  --windows 0:768,6227:768,16975:512
```

The process ended abruptly while processing the sixth shard. It did not run an Effect failure
handler or finalize Bun's CPU profile, and the report therefore remains `running`. The partial run
is still useful because five complete per-shard records and the corresponding macOS observations
were flushed durably.

The CPU profiler adds overhead and may have made the terminal memory pressure worse. The earlier
unprofiled full corpus build nevertheless took about 62 minutes and showed the same severe system
symptoms, so profiler overhead is not a complete explanation.

## Per-shard observations

Times and resources below come from `run.log.jsonl`. Stage work is summed across crawls; asynchronous
read work can overlap and therefore must not be added to wall time.

| Shard | Historical region |  Wall | Encode | Parse | Read work | Write | User CPU | System CPU | RSS after | Max RSS | Minor faults | Involuntary switches |
| ----: | ----------------- | ----: | -----: | ----: | --------: | ----: | -------: | ---------: | --------: | ------: | -----------: | -------------------: |
|     1 | Aug 2025          |  8.4s |   4.1s |  2.8s |     12.6s |  28ms |     6.9s |       2.2s |     5.5GB |   7.5GB |         817k |                15.6k |
|     2 | Aug 2025          | 10.1s |   5.4s |  3.0s |     13.8s |  51ms |     7.0s |       4.6s |     3.9GB |   7.5GB |        1.34m |                52.7k |
|     3 | Aug–Sep 2025      | 15.0s |   6.9s |  5.3s |     23.7s |  78ms |    12.8s |      10.0s |     3.6GB |   8.6GB |        2.22m |               139.7k |
|     4 | Feb 2026          | 46.2s |  30.8s | 11.9s |     45.2s | 160ms |    16.2s |      23.5s |     3.9GB |   8.6GB |        4.20m |               311.1k |
|     5 | Feb 2026          | 71.0s |  33.3s | 33.2s |    111.3s | 475ms |    19.9s |      34.3s |     3.4GB |   8.6GB |        5.51m |               400.0k |

Bun reported 21.6GB of heap accounting after shard 5 while resident memory was approximately
3.4GB. These counters measure different things, but their divergence is consistent with a very
large allocation/collection working set and aggressive OS reclamation rather than 21.6GB of
simultaneously resident memory.

## macOS impact

Concurrent `iostat -w 1`, `vm_stat 1`, `memory_pressure`, and unified-log inspection showed:

- Disk throughput repeatedly reached 500MB/s to 1.47GB/s.
- Disk transaction rates repeatedly reached 10,000 to 26,000 operations per second.
- Those rates continued while individual corpus writes took only 28–475ms and produced files of
  roughly 44–75MB.
- `vm_stat` showed sustained compression, decompression, swap-ins, and swap-outs in tens of
  thousands of 16KB pages per second.
- macOS sent memory-pressure warnings to unrelated processes beginning at 15:04:25.
- Unified logs then showed widespread memorystatus/jetsam activity.
- Memory and compressor pressure rapidly receded after the Bun process disappeared.

This establishes the causal chain:

```text
large transient Bun/JSC allocation working set
  -> macOS memory compression and reclamation
  -> swap and page traffic at hundreds of MB/s
  -> high system CPU and context-switch rates
  -> latency and responsiveness impact across the machine
```

`process.resourceUsage().fsRead` and `fsWrite` remained zero on this macOS/Bun combination and are
not useful counters here. The process CPU, RSS, page-fault, and context-switch fields were useful;
system-wide disk and VM counters supplied the missing I/O evidence.

## Instrumentation added

Corpus builds now support explicit diagnostic windows:

```text
--windows offset:count,offset:count
```

Windows must be ordered, non-overlapping, and within the available crawl range. They cannot be
combined with `--limit`.

Every completed shard now logs:

- Read, gunzip, text decode, JSON parse, clean, deduplicate, encode, write, and hash work timings
- RSS, maximum RSS, heap, external, and array-buffer memory
- User and system CPU
- Minor and major page faults
- Voluntary and involuntary context switches
- Bun's filesystem resource counters, even though they currently report zero on this platform

Successful run reports also include peak RSS and aggregate stage work. Partial or externally
terminated runs retain completed shard observations in `run.log.jsonl`.

## Evidence locations

- Partial diagnostic run: `/tmp/orca-labs-corpus-profile-2048/`
- Structured observations: `/tmp/orca-labs-corpus-profile-2048/run.log.jsonl`
- Partial shard outputs: the temporary `corpus.*.tmp/shards/` directory inside that run
- Earlier completed CPU profile: `/private/tmp/orca-labs-corpus-256.cpuprofile.md.md`

The 2,048-crawl CPU profile was not finalized because the process ended abruptly.
