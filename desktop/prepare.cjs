const fs = require('node:fs');
const path = require('node:path');
const source = path.join(__dirname, '..', 'public', 'barista');
const destination = path.join(__dirname, 'assets');
fs.mkdirSync(destination, { recursive: true });
fs.copyFileSync(path.join(__dirname, '..', 'public', 'icon-192.png'), path.join(destination, 'coffeetide-tray.png'));
for (const file of fs.readdirSync(source)) {
  if (/^[a-z0-9_-]+\.(png|jpg|webp)$/i.test(file)) fs.copyFileSync(path.join(source, file), path.join(destination, file));
}
