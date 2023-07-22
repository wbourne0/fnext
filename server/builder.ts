import { build } from 'esbuild';
import internal, { Writable } from 'stream';
import { ChildProcessByStdio, spawn } from 'child_process';
import { createInterface, Interface } from 'readline';
import { EventEmitter } from 'events';

const emitter = new EventEmitter();
const messages = Buffer.alloc(0);

let proc: ChildProcessByStdio<null, internal.Readable, null>;
let rl: Interface;

function start() {
  proc = spawn('go run . .', {
    stdio: ['inherit', 'pipe', 'inherit'],
  });

  proc.stdout.pause();
  process.nextTick(() => proc.stdout.resume());

  rl = createInterface(proc.stdout);

  rl.on('line', (content) => {
    if (content.startsWith('r:')) {
      emitter.emit('reload', Number(content.slice(2)));
    }
  });
}


export function onReload(handler: (id: number) => void): () => void {
  emitter.on('reload', handler);

  return () => emitter.off('reload', handler);
}
