import { BloomFilter } from './src/main';
import { performance } from 'perf_hooks';

// Update benchmark.ts to output JSON format for GitHub Actions
const benchmarkResults: Record<string, number> = {};

const runBenchmark = async () => {
  console.log("Running Bloom Filter Benchmarks...\n");

  // Initialization benchmark
  const initStart = performance.now();
  const filter = new BloomFilter(10, 1000000);
  const initEnd = performance.now();
  console.log(`Initialization: ${(initEnd - initStart).toFixed(2)}ms`);

  // Add operation benchmark
  const addStart = performance.now();
  for (let i = 0; i < 100000; i++) {
    filter.add(`test-${i}`);
  }
  const addEnd = performance.now();
  console.log(`Add 100k items: ${(addEnd - addStart).toFixed(2)}ms`);

  // Exists operation benchmark
  const existsStart = performance.now();
  for (let i = 0; i < 100000; i++) {
    filter.exists(`test-${i}`);
  }
  const existsEnd = performance.now();
  console.log(`Check 100k items: ${(existsEnd - existsStart).toFixed(2)}ms`);

  // Run benchmarks and store results
  benchmarkResults["initialization"] = initEnd - initStart;
  benchmarkResults["add_100k_items"] = addEnd - addStart;
  benchmarkResults["check_100k_items"] = existsEnd - existsStart;

  // Write results to file
  await Bun.write(
    "benchmark-results.json",
    JSON.stringify({
      name: "Bloom Filter Benchmarks",
      date: new Date().toISOString(),
      results: benchmarkResults,
    })
  );
};

runBenchmark().catch(console.error);