import { NextResponse } from 'next/server';
import os from 'os';

export async function GET() {
  const nets = os.networkInterfaces();
  const candidates: string[] = [];

  for (const name of Object.keys(nets)) {
    const netList = nets[name];
    if (!netList) continue;
    for (const net of netList) {
      if (net.family === 'IPv4' && !net.internal && !net.address.startsWith('169.254.')) {
        if (net.address.startsWith('192.168.') || net.address.startsWith('10.') || net.address.startsWith('172.')) {
          candidates.unshift(net.address);
        } else {
          candidates.push(net.address);
        }
      }
    }
  }

  const lanIp = candidates[0] || '127.0.0.1';
  const port = process.env.PORT || 3000;

  return NextResponse.json({
    success: true,
    ip: lanIp,
    port: Number(port),
    localUrl: `http://localhost:${port}`,
    networkUrl: `http://${lanIp}:${port}`,
    posUrl: `http://${lanIp}:${port}/pos`,
    adminUrl: `http://${lanIp}:${port}/admin`,
  });
}
