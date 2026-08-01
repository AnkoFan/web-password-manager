use std::{
    sync::Arc,
    thread,
    time::{Duration, Instant},
};

use argon2::{Algorithm, Argon2, Params, Version};
use serde::Serialize;

const MEMORY_KIB: u32 = 64 * 1024;
const ITERATIONS: u32 = 3;
const PARALLELISM: u32 = 1;
const OUTPUT_LENGTH: usize = 32;
const TEST_PASSWORD: &[u8] = b"TEST-ONLY-kdf-benchmark-password";
const TEST_SALT: &[u8; 16] = b"TEST-ONLY-SALT!!";

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct BenchmarkResult {
    profile: &'static str,
    memory_kib: u32,
    iterations: u32,
    parallelism: u32,
    samples: usize,
    concurrent_workers: usize,
    sequential_millis: Vec<f64>,
    sequential_min_millis: f64,
    sequential_median_millis: f64,
    sequential_p95_millis: f64,
    concurrent_wall_millis: f64,
    concurrent_worker_millis: Vec<f64>,
}

fn derive(argon2: &Argon2<'_>) -> Result<Duration, String> {
    let mut output = [0_u8; OUTPUT_LENGTH];
    let started = Instant::now();
    argon2
        .hash_password_into(TEST_PASSWORD, TEST_SALT, &mut output)
        .map_err(|error| format!("Argon2id benchmark failed: {error}"))?;
    let elapsed = started.elapsed();
    output.fill(0);
    Ok(elapsed)
}

fn percentile(sorted: &[f64], percentile: f64) -> f64 {
    let index = ((sorted.len() - 1) as f64 * percentile).ceil() as usize;
    sorted[index]
}

fn main() -> Result<(), String> {
    let samples = std::env::args()
        .nth(1)
        .and_then(|value| value.parse::<usize>().ok())
        .filter(|value| *value >= 5)
        .unwrap_or(10);
    let concurrent_workers = std::env::args()
        .nth(2)
        .and_then(|value| value.parse::<usize>().ok())
        .filter(|value| (1..=4).contains(value))
        .unwrap_or(2);
    let params = Params::new(MEMORY_KIB, ITERATIONS, PARALLELISM, Some(OUTPUT_LENGTH))
        .map_err(|error| format!("Invalid benchmark parameters: {error}"))?;
    let argon2 = Arc::new(Argon2::new(Algorithm::Argon2id, Version::V0x13, params));

    derive(argon2.as_ref())?;
    let mut sequential_millis = Vec::with_capacity(samples);
    for _ in 0..samples {
        sequential_millis.push(derive(argon2.as_ref())?.as_secs_f64() * 1000.0);
    }
    let mut sorted = sequential_millis.clone();
    sorted.sort_by(f64::total_cmp);

    let concurrent_started = Instant::now();
    let handles = (0..concurrent_workers)
        .map(|_| {
            let argon2 = Arc::clone(&argon2);
            thread::spawn(move || derive(argon2.as_ref()).map(|value| value.as_secs_f64() * 1000.0))
        })
        .collect::<Vec<_>>();
    let concurrent_worker_millis = handles
        .into_iter()
        .map(|handle| {
            handle
                .join()
                .map_err(|_| "Argon2id benchmark worker panicked".to_string())?
        })
        .collect::<Result<Vec<_>, _>>()?;

    let result = BenchmarkResult {
        profile: "argon2id-19-m65536-t3-p1",
        memory_kib: MEMORY_KIB,
        iterations: ITERATIONS,
        parallelism: PARALLELISM,
        samples,
        concurrent_workers,
        sequential_min_millis: sorted[0],
        sequential_median_millis: percentile(&sorted, 0.5),
        sequential_p95_millis: percentile(&sorted, 0.95),
        sequential_millis,
        concurrent_wall_millis: concurrent_started.elapsed().as_secs_f64() * 1000.0,
        concurrent_worker_millis,
    };
    println!(
        "{}",
        serde_json::to_string_pretty(&result)
            .map_err(|error| format!("Unable to serialize benchmark result: {error}"))?
    );
    Ok(())
}
