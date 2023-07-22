import path from 'path';
import { EventEmitter } from 'events';
import { Worker } from 'worker_threads';
import type {
  WorkerResponse,
  WorkerRequest,
  WorkerResponseReady,
} from './worker';
import { fnextBuildDir } from './paths';
import type { BuildMeta } from './types';

const emitter = new EventEmitter();

const workerCodePath = path.join(
  fnextBuildDir,
  `server/build_util/worker.${__IS_ESM__ ? 'mjs' : 'js'}`
);

let workerData: BuildMeta;

let idleWorkers = new Array<FNextWorker>(1);
let workerCount: number;

const maxWorkerCount = 32;
let lastUpdated = 0;

class FNextWorker extends Worker {
  public readonly ready: Promise<void>;
  public readonly createdAt: number;

  constructor() {
    super(workerCodePath, { workerData });
    this.unref();
    this.ready = new Promise((resolve, reject) => {
      const handle = setTimeout(() => {
        reject(new Error('expected worker to start in <1s'));
      }, 1000);

      this.once('message', (res: WorkerResponse) => {
        clearTimeout(handle);
        if (res.type !== 'ready') {
          reject(new Error("expected worker's response to be ready"));
        }

        resolve();
      });
    });

    this.createdAt = Date.now();
  }

  request(req: WorkerRequest) {
    this.postMessage(req);

    return new Promise<string>((resolve, reject) => {
      this.once(
        'message',
        (resp: Exclude<WorkerResponse, WorkerResponseReady>) => {
          if (resp.type === 'error') {
            reject(resp.error);
          } else {
            resolve(resp.data);
          }
        }
      );
    });
  }
}

function setup() {
  const worker = new FNextWorker();
  workerCount = 1;

  if (!emitter.emit('free', worker)) {
    idleWorkers.push(worker);
  }
}

export async function init(data: BuildMeta) {
  workerData = data;
  setup();
}

export async function request(req: WorkerRequest) {
  let worker = idleWorkers.pop();

  if (!worker) {
    if (workerCount < maxWorkerCount) {
      worker = new FNextWorker();
      workerCount++;

      try {
        await worker.ready;
      } catch (err) {
        workerCount--;
        throw err;
      }
    } else {
      worker = await new Promise<FNextWorker>((resolve) =>
        emitter.once('free', resolve)
      );
    }
  }

  await worker.ready;

  return worker.request(req).finally(() => {
    if (worker && worker.createdAt >= lastUpdated) {
      if (!emitter.emit('free', worker)) {
        idleWorkers.push(worker);
      }
    }
  });
}

export async function reset() {
  lastUpdated = Date.now();
  const prevWorkers = idleWorkers;
  idleWorkers = [];
  setup();
  await Promise.all(prevWorkers.map((worker) => worker.terminate()));
}
