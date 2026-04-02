import { createServer } from 'http';
import { readFile } from 'fs/promises';
import { join, extname } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIME = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml', '.webp': 'image/webp' };

createServer(async (req, res) => {
  let url = req.url === '/' ? '/index.html' : req.url;
  // Basic path traversal protection
  url = url.replace(/\.\.\//g, ''); 
  try {
    const filePath = join(__dirname, url);
    const data = await readFile(filePath);
    res.writeHead(200, { 'Content-Type': MIME[extname(url)] || 'text/html' });
    res.end(data);
  } catch { res.writeHead(404); res.end('Not found'); }
}).listen(8080, () => console.log('Server running on port 8080'));
