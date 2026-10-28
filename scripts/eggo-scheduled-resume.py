"""One user-requested, hidden, quota-aware continuation at a fixed timestamp."""
from pathlib import Path
from datetime import datetime
import argparse, importlib.util, json, os, time


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--config',type=Path,required=True)
    parser.add_argument('--check',action='store_true')
    args=parser.parse_args()
    config=json.loads(args.config.read_text(encoding='utf-8'))
    state_path=args.config.parent/'state.json'
    spec=importlib.util.spec_from_file_location('quota_watch',config['watcher_library'])
    watcher=importlib.util.module_from_spec(spec);spec.loader.exec_module(watcher)
    target=datetime.fromisoformat(config['not_before']).timestamp()
    state={'thread':config['thread'],'not_before':config['not_before'],'pid':os.getpid()}

    def save(action,**details):
        state.update(action=action,checked_at=time.time(),**details)
        watcher.save_state(state_path,state)

    if args.check:
        with watcher.AppServerClient(config['codex_exe'],20) as client:
            rate=client.request('account/rateLimits/read',{})
            task=watcher.task_snapshot(client,config['thread'])
            save('checked-no-turn-started',task=task,rate=rate)
        print(json.dumps({'thread':config['thread'],'not_before':config['not_before'],
            'task_active':task['active'],'connection':'verified','model_turns_started':0}))
        return

    # The caller checks running processes too; this lock protects against an
    # accidental second launch between that inspection and process creation.
    lock=args.config.parent/'running.lock'
    fd=os.open(lock,os.O_CREAT|os.O_EXCL|os.O_WRONLY)
    os.write(fd,str(os.getpid()).encode('ascii'));os.close(fd)
    try:
        save('waiting-for-scheduled-time')
        while time.time()<target:
            time.sleep(min(config['interval_seconds'],target-time.time()))
        while time.time()<target+config['maximum_retry_seconds']:
            try:
                with watcher.AppServerClient(config['codex_exe'],20) as client:
                    rate=client.request('account/rateLimits/read',{})
                    limits=rate.get('rateLimitsByLimitId',{}).get('codex') or rate.get('rateLimits',{})
                    primary=limits.get('primary') or {}
                    secondary=limits.get('secondary') or {}
                    task=watcher.task_snapshot(client,config['thread'])
                    if task['active']:
                        save('already-running-no-duplicate',task=task)
                        return
                    allowed=(primary.get('usedPercent') is not None
                        and primary['usedPercent']<100
                        and (secondary.get('usedPercent') or 0)<100
                        and not limits.get('rateLimitReachedType')
                        and not limits.get('spendControlReached'))
                    if not allowed:
                        save('waiting-for-quota',task=task,rate=rate)
                    else:
                        client.request('thread/resume',{'threadId':config['thread']})
                        result=client.request('turn/start',{'threadId':config['thread'],
                            'input':[{'type':'text','text':config['message']}]})
                        save('resumed-once',turn_id=result.get('turn',{}).get('id'),rate=rate)
                        return
            except (OSError,watcher.RpcError,TimeoutError) as exc:
                save('retrying-connection',error=str(exc))
            time.sleep(config['interval_seconds'])
        save('expired-without-starting')
    finally:
        lock.unlink(missing_ok=True)


if __name__=='__main__':
    main()
