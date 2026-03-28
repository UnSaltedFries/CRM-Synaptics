import { createServer } from 'http';
import { readFile } from 'fs/promises';
import { join, extname } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIME = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml', '.webp': 'image/webp' };

createServer(async (req, res) => {
  const file = req.url === '/' ? '/crm-synaptic.html' : req.url;
  try {
    const data = await readFile(join(__dirname, file));
    res.writeHead(200, { 'Content-Type': MIME[extname(file)] || 'text/html' });
    res.end(data);
  } catch { res.writeHead(404); res.end('Not found'); }
}).listen(8080, () => console.log('Server running on port 8080'));
