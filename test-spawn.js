const { spawn } = require('child_process');

const scrcpy = "C:\\Users\\llewe\\Documents\\00-CODES\\01-PERSONAL\\wireshare\\scrcpy-win64\\scrcpy.exe";
const args = ["-s", "10.206.85.202:41805", "--max-size", "1024"];

console.log("Spawning scrcpy detached...");
const p = spawn(scrcpy, args, {
  cwd: "C:\\Users\\llewe\\Documents\\00-CODES\\01-PERSONAL\\wireshare\\scrcpy-win64",
  detached: true,
  stdio: 'ignore',
  windowsHide: false
});

p.unref();
console.log("Done.");
