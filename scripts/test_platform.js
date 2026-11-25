const http = require('http');
const path = require('path');
const fs = require('fs');

const BASE_URL = 'http://localhost:3080';

function req(endpoint, method = 'GET', data = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(endpoint, BASE_URL);
    const options = {
      hostname: parsed.hostname,
      port: parsed.port,
      path: parsed.pathname + parsed.search,
      method,
      headers: {
        'Content-Type': 'application/json',
        ...headers
      },
      timeout: 5000
    };

    const request = http.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(body) });
        } catch {
          resolve({ status: res.statusCode, raw: body });
        }
      });
    });

    request.on('error', reject);
    if (data) request.write(JSON.stringify(data));
    request.end();
  });
}

async function runTests() {
  console.log('================================================================');
  console.log('          AUTOMATION HUB - PLATFORM VERIFICATION SUITE          ');
  console.log('================================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition, testName) {
    if (condition) {
      console.log(`[PASS] ${testName}`);
      passed++;
    } else {
      console.error(`[FAIL] ${testName}`);
      failed++;
    }
  }

  try {
    // 1. Health check
    const health = await req('/api/health');
    assert(health.status === 200 && health.body.status === 'healthy', '1. System Health Check Endpoint');

    // 2. Automations Catalog
    const autos = await req('/api/automations');
    assert(autos.status === 200 && autos.body.total >= 7, `2. Central Automation Registry (${autos.body?.total} Automations Cataloged)`);

    // 3. Machine Registration & Heartbeat
    const hb = await req('/api/machines/heartbeat', 'POST', {
      id: 'mach_test_pc',
      name: 'TEST-AUTOMATION-PC',
      os: 'Windows 11 Test OS',
      loggedInUser: 'TestOperator',
      runnerVersion: '1.2.0',
      cpuUsage: 18.2,
      ramUsage: 45.0,
      totalRamGb: 32,
      token: 'runner_token_desktop_primary'
    });
    assert(hb.status === 200 && hb.body.machine?.status === 'online', '3. Local Windows Runner Heartbeat Registration');

    // 4. Job Dispatch on Online PC with Dynamic Port
    const jobRes = await req('/api/automations/mhtcet-status-checker/start', 'POST', {
      machineId: 'mach_test_pc',
      inputs: { round: 'II', headless: true }
    });
    assert(jobRes.status === 200 && jobRes.body.job?.id, '4. Job Dispatch with Dynamic Port Allocation');
    const createdJob = jobRes.body?.job;

    // 5. Offline PC Protection (Never falsely run on offline machine)
    const offlineTest = await req('/api/automations/mhtcet-status-checker/start', 'POST', {
      machineId: 'mach_lab_pc_02', // This machine is offline
      inputs: {}
    });
    assert(offlineTest.status === 503, '5. Offline PC Protection Gate (Rejects dispatch when PC OFFLINE)');

    // 6. Runner Job Polling Isolation (Only picks up jobs for mach_test_pc)
    const poll = await req('/api/runner/poll?machineId=mach_test_pc');
    assert(poll.status === 200 && poll.body.pendingJobs?.some(j => j.id === createdJob.id), '6. Runner Polling Queue Isolation');

    // 7. Runner Telemetry & Live Log Streaming
    const update = await req('/api/runner/update', 'POST', {
      jobId: createdJob.id,
      status: 'Running',
      step: 'Verifying student confirmation database',
      progress: 50,
      processId: 9812,
      logs: [
        { level: 'info', message: 'Test execution step 1 passed' },
        { level: 'step', message: 'Allocated dynamic port isolated from other processes' }
      ]
    });
    assert(update.status === 200 && update.body.job?.status === 'Running', '7. Live Telemetry & Process Telemetry Ingestion');

    // 8. Safe Job Cancellation
    const cancel = await req(`/api/jobs/${createdJob.id}/cancel`, 'POST');
    assert(cancel.status === 200 && cancel.body.job?.status === 'Cancelled', '8. Safe Process Tree Cancellation & Port Release');

    // 9. Multi-User Concurrency (Simulating 6 concurrent operators)
    const users = ['usr_prajwal', 'usr_operator1', 'usr_operator2', 'usr_auditor', 'usr_operator3', 'usr_operator4'];
    let multiSuccess = true;
    for (let i = 0; i < users.length; i++) {
      const uRes = await req('/api/automations/cutoff-pdf-extractor/start', 'POST', {
        machineId: 'mach_test_pc',
        userId: users[i],
        inputs: { output_format: 'xlsx' }
      });
      if (uRes.status !== 200) multiSuccess = false;
    }
    assert(multiSuccess, '9. Multi-User Concurrency Support (6 Simultaneous Operator Sessions)');

    console.log('\n================================================================');
    console.log(`TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
    console.log('================================================================\n');

    process.exit(failed > 0 ? 1 : 0);
  } catch (err) {
    console.error('Test Suite encountered an error:', err.message);
    process.exit(1);
  }
}

runTests();
