import { runStudentAutomation } from '../src/automationEngine';

async function main() {
  const config = {
    studentId: 'LIVE_TEST',
    studentName: 'Shreya Patil',
    email: 'shreyappatil7@gmail.com',
    password: 'Pass@123',
    courseType: 'Direct Second Year Degree in Engineering' as const,
    choices: [
      { prefNo: 1, branch: 'Civil Engineering', choiceCode: '0100219110', institute: '', city: '', rank: '', percentile: '', category: '' },
      { prefNo: 2, branch: 'Computer Science', choiceCode: '0100224210', institute: '', city: '', rank: '', percentile: '', category: '' },
      { prefNo: 3, branch: 'Computer Science', choiceCode: '0100224610', institute: '', city: '', rank: '', percentile: '', category: '' }
    ]
  };

  console.log('Starting live test in headed mode...');
  
  const result = await runStudentAutomation(config, {
    onProgress: (percent, stepName) => {
      console.log(`[Progress ${percent}%] ${stepName}`);
    },
    onLog: (msg) => {
      console.log(`[Log] ${msg}`);
    }
  });

  console.log('\n======================================================');
  console.log('Automation Job Finished!');
  console.log('Success Status:', result.success);
  if (result.screenshotUrl) {
    console.log('Verification Screenshot:', result.screenshotUrl);
  }
  if (result.error) {
    console.log('Error Message:', result.error);
  }
  console.log('======================================================\n');
}

main().catch(console.error);
