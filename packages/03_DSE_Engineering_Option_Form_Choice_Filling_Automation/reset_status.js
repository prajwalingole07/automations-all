const fs = require('fs');
const path = require('path');

const dbPath = path.join(__dirname, 'students_db.json');

try {
  if (fs.existsSync(dbPath)) {
    const raw = fs.readFileSync(dbPath, 'utf-8');
    const data = JSON.parse(raw);
    let count = 0;

    const exceptions = [
      "ADLING MANAS OMPRAKASH",
      "BAHETI RAGHAV DATTAPRASAD",
      "BAHETI SHREYA NILESHKUMAR"
    ];

    for (const key in data) {
      if (!exceptions.includes(data[key].name)) {
        if (data[key].status === 'Queued') {
          data[key].status = 'Pending';
          count++;
        }
      }
    }

    fs.writeFileSync(dbPath, JSON.stringify(data, null, 2));
    console.log(`Successfully reset status from Queued to Pending for ${count} students.`);
  } else {
    console.log("students_db.json not found.");
  }
} catch (e) {
  console.error("Error updating statuses:", e);
}
