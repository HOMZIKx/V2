import { Injectable } from '@nestjs/common';
import { type Observable, ReplaySubject } from 'rxjs';

import type { WorkspaceSnapshotRecord } from '../domain/ports/player-team-state.port.js';

@Injectable()
export class WorkspaceLiveBus {
  private readonly streams = new Map<string, ReplaySubject<WorkspaceSnapshotRecord>>();

  public events(workspaceId: string): Observable<WorkspaceSnapshotRecord> {
    let stream = this.streams.get(workspaceId);
    if (stream === undefined) {
      stream = new ReplaySubject<WorkspaceSnapshotRecord>(1);
      this.streams.set(workspaceId, stream);
    }
    return stream.asObservable();
  }

  public publish(record: WorkspaceSnapshotRecord): void {
    let stream = this.streams.get(record.workspaceId);
    if (stream === undefined) {
      stream = new ReplaySubject<WorkspaceSnapshotRecord>(1);
      this.streams.set(record.workspaceId, stream);
    }
    stream.next(record);
  }
}
