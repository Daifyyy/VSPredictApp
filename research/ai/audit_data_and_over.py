"""Read-only local evidence audit. No DB, provider, training or production imports."""
import collections
import hashlib
import json
import math
import random
from pathlib import Path
from datetime import datetime, timedelta, timezone

ROOT = Path(__file__).resolve().parents[2]
DATA = '.runtime/ai-research/404ac6e89bc10ca39cd17dc546a0636efcd66dd2df0a7eb90604b7514b1459a9.dataset.json'
LEDGER = '.runtime/strategy-evidence-v1/2026-10-18T12-35-05-827Z.json'
SIGNALS = '.runtime/strategy-audit/evidence.json'

def load(path):
    return json.loads((ROOT/path).read_text(encoding='utf8'))

def date(s):
    return datetime.fromisoformat(s.replace('Z','+00:00'))

def mean(xs):
    return sum(xs)/len(xs) if xs else None

def wilson(hits, n):
    if not n: return None
    p=hits/n; z=1.959963984540054; d=1+z*z/n
    center=(p+z*z/(2*n))/d; radius=z*math.sqrt(p*(1-p)/n+z*z/(4*n*n))/d
    return [center-radius, center+radius]

def binary(ps, ys):
    assert len(ps)==len(ys)
    if not ps: return {'n':0}
    assert all(math.isfinite(p) and 0<=p<=1 for p in ps)
    bins=[]
    for b in range(10):
        ix=[i for i,p in enumerate(ps) if min(9,int(p*10))==b]
        if ix: bins.append({'lower':b/10,'n':len(ix),'meanP':mean([ps[i] for i in ix]),'actual':mean([ys[i] for i in ix]),'actual95':wilson(sum(ys[i] for i in ix),len(ix))})
    return {'n':len(ps),'meanP':mean(ps),'actual':mean(ys),'biasPp':100*(mean(ps)-mean(ys)),
            'brier':mean([(p-y)**2 for p,y in zip(ps,ys)]),
            'logLoss':mean([-math.log(max(1e-12,p if y else 1-p)) for p,y in zip(ps,ys)]),
            'ece':sum(x['n']*abs(x['meanP']-x['actual']) for x in bins)/len(ps),'bins':bins}

def grouped(rows, key):
    out=collections.defaultdict(list)
    for r in rows: out[key(r)].append(r)
    return dict(sorted(out.items(),key=lambda kv:str(kv[0])))

def multiclass(rows, field):
    ps=[r[field]['oneXTwo'] for r in rows]; ys=[r['outcome'] for r in rows]
    assert all(len(p)==3 and abs(sum(p)-1)<1e-6 and all(math.isfinite(v) and 0<=v<=1 for v in p) for p in ps)
    return {'n':len(rows),'logLoss':mean([-math.log(max(1e-12,p[y])) for p,y in zip(ps,ys)]),
            'brier':mean([sum((v-int(i==y))**2 for i,v in enumerate(p)) for p,y in zip(ps,ys)]),
            'accuracy':mean([int(max(range(3),key=lambda i:p[i])==y) for p,y in zip(ps,ys)])}

def audit():
    d=load(DATA); rows=d['rows']; ledger=load(LEDGER); old=load(SIGNALS)
    sources=[DATA,LEDGER,SIGNALS,'research/ai/audit_data_and_over.py']+[s['file'] for s in d['sources']]
    hashes={p:hashlib.sha256((ROOT/p).read_bytes()).hexdigest() for p in sources}
    assert hashes[DATA]==Path(DATA).name.split('.')[0]
    for source in d['sources']: assert hashes[source['file']]==source['hash']
    names=d['featureNames']; cols={name:i for i,name in enumerate(names)}
    def present(r, side, metric): return r['values'][cols[f'{side}.own.{metric}']] is not None
    def profile(rs):
        return {'n':len(rs),'from':min(r['day'] for r in rs),'to':max(r['day'] for r in rs),
                'bothXg':sum(all(present(r,s,'XG') for s in ('home','away')) for r in rs),
                'bothShots':sum(all(present(r,s,'SHOTS') for s in ('home','away')) for r in rs),
                'neitherXg':sum(not any(present(r,s,'XG') for s in ('home','away')) for r in rs),
                'coverageMean':mean([r['coverage'] for r in rs]),'coverage75':sum(r['coverage']>=.75 for r in rs),
                'over':binary([r['baseline']['over'] for r in rs],[r['over'] for r in rs]),
                'leagueOver':binary([r['leagueBaseline']['over'] for r in rs],[r['over'] for r in rs]),
                'oneXTwo':multiclass(rs,'baseline'),'leagueOneXTwo':multiclass(rs,'leagueBaseline')}
    days=sorted(set(r['day'] for r in rows)); c70=days[int(len(days)*.7)]; c80=days[int(len(days)*.8)]
    partition=lambda r:'DEVELOPMENT' if r['day']<c70 else 'CALIBRATION' if r['day']<c80 else 'TERMINAL_EXPLORED'
    invariants={'duplicateFixtures':len(rows)-len(set(r['fixtureId'] for r in rows)),
                'badDimensions':sum(len(r['values'])!=len(names) for r in rows),
                'nonfiniteValues':sum(any(v is not None and not math.isfinite(v) for v in r['values']) for r in rows),
                'historyTooLate':sum(bool(r['latestHistory']) and date(r['latestHistory'])+timedelta(hours=3)>=datetime.fromisoformat(r['day']).replace(tzinfo=timezone.utc) for r in rows),
                'invalidTargets':sum(r['outcome'] not in (0,1,2) or r['over'] not in (0,1) for r in rows)}
    inventory={}; duplicates=[]; conflicts=[]; raw_stats={}; invalid_stats=[]
    for source in d['sources']:
        obj=load(source['file'])
        if 'season-inventories' in source['file']:
            for f in obj['fixtures']:
                if f['fixtureId'] in inventory:
                    duplicates.append(f['fixtureId'])
                    if inventory[f['fixtureId']]!=f: conflicts.append(f['fixtureId'])
                inventory[f['fixtureId']]=f
        else:
            raw_stats.update({int(k):v for k,v in obj.items()})
            for fid,sides in obj.items():
                for side,vs in sides.items():
                    for metric in ('XG','SHOTS','SHOTS_ON_TARGET','SHOTS_INSIDE_BOX','CORNERS'):
                        v=vs.get(metric)
                        if v is not None and (not isinstance(v,(float,int)) or not math.isfinite(v) or v<0): invalid_stats.append([fid,side,metric,'INVALID'])
                    for metric in ('SHOTS_ON_TARGET','SHOTS_INSIDE_BOX'):
                        if vs.get(metric) is not None and vs.get('SHOTS') is not None and vs[metric]>vs['SHOTS']: invalid_stats.append([fid,side,metric,'EXCEEDS_SHOTS'])
    join_errors=[]
    for r in rows:
        f=inventory.get(r['fixtureId'])
        if not f or f['status']!='FT' or date(f['kickoff'])!=date(r['kickoff']) or (0 if f['homeGoals']>f['awayGoals'] else 1 if f['homeGoals']==f['awayGoals'] else 2)!=r['outcome'] or int(f['homeGoals']+f['awayGoals']>2)!=r['over']:
            join_errors.append(r['fixtureId'])
    # How stale is the most recent advanced observation actually available to a team?
    history=[]
    for source in d['sources']:
        if 'season-inventories' not in source['file']: continue
        obj=load(source['file'])
        for f in obj['fixtures']:
            if f['status']=='FT' and f['fixtureId'] in raw_stats:
                history.append((date(f['kickoff']),obj['leagueId'],f,raw_stats[f['fixtureId']]))
    history.sort(key=lambda x:x[0]); cursor=0; last={}; ages=[]
    for r in rows:
        origin=datetime.fromisoformat(r['day']).replace(tzinfo=timezone.utc)
        while cursor<len(history) and history[cursor][0]+timedelta(hours=3)<origin:
            when,league,f,s=history[cursor]; cursor+=1
            for side,team in [('home',f['homeTeamId']),('away',f['awayTeamId'])]:
                if s.get(side,{}).get('XG') is not None: last[league,team]=when
        f=inventory[r['fixtureId']]
        for side,team in [('home',f['homeTeamId']),('away',f['awayTeamId'])]:
            if present(r,side,'XG') and (r['leagueId'],team) in last:
                ages.append({'fixtureId':r['fixtureId'],'side':side,'partition':partition(r),'days':(origin-last[r['leagueId'],team]).total_seconds()/86400})
    fixtures={f['fixtureId']:f for f in ledger['fixtures']}; exclusions=collections.Counter(); selected=[]; result_mismatches=[]
    for r in ledger['rows']:
        if r['market']!='OVER_25' or r['modelContext']!='LEAGUE': continue
        f=fixtures.get(r['fixtureId'])
        if not f or f['status']!='FT': exclusions['NO_FT_RESULT']+=1; continue
        if not r['qualifiedAt'] or date(r['qualifiedAt'])>=date(r['kickoff']): exclusions['NO_PREMATCH_QUALIFICATION']+=1; continue
        if r['settlementStatus']!='SETTLED' or r['hit'] is None or not r['decimalOdds'] or r['decimalOdds']<=1: exclusions['NOT_PRICED_SETTLED']+=1; continue
        actual=f['homeGoals']+f['awayGoals']>2
        if actual!=r['hit']: result_mismatches.append(r['id']); continue
        selected.append(r)
    def cohort(rs):
        rs=sorted(rs,key=lambda r:r['kickoff']); ps=[r['modelProbability'] for r in rs]; ys=[int(r['hit']) for r in rs]
        profit=sum(r['decimalOdds']-1 if r['hit'] else -1 for r in rs)
        paired=[r for r in rs if isinstance(r['marketProbability'],(int,float)) and 0<r['marketProbability']<1]
        dates=sorted(set(r['kickoff'][:10] for r in rs)); split=dates[int(len(dates)*.7)] if len(dates)>2 else None
        late=[r for r in rs if split and r['kickoff'][:10]>=split]
        blocks=list(grouped(rs,lambda r:r['kickoff'][:10]).values()); intervals=[]; rng=random.Random(20261023)
        if len(blocks)>=5:
            for _ in range(5000):
                sample=[r for _ in blocks for r in rng.choice(blocks)]
                intervals.append(sum(r['decimalOdds']-1 if r['hit'] else -1 for r in sample)/len(sample))
            intervals.sort()
        return {'n':len(rs),'fixtures':len(set(r['fixtureId'] for r in rs)),'days':len(dates),'from':dates[0],'to':dates[-1],
                'hits':sum(ys),'hitRate':mean(ys),'hit95':wilson(sum(ys),len(ys)), 'profitUnits':profit,'roi':profit/len(rs),'roiDayBlock95':[intervals[124],intervals[4874]] if intervals else None,'averageOdds':mean([r['decimalOdds'] for r in rs]),
                'model':binary(ps,ys),'pairedModel':binary([r['modelProbability'] for r in paired],[int(r['hit']) for r in paired]),
                'pairedMarket':binary([r['marketProbability'] for r in paired],[int(r['hit']) for r in paired]),
                'laterDescriptive':{'cut':split,'n':len(late),'profitUnits':sum(r['decimalOdds']-1 if r['hit'] else -1 for r in late)},
                'primaryClv':sum(r['clvMethodVersion']==2 and r['closedAt'] is not None and 0<r.get('closingBenchmarkProbability',0)<1 and 0<=(date(r['kickoff'])-date(r['closedAt'])).total_seconds()<=1800 for r in rs)}
    key=lambda r:'/'.join(str(r[x]) for x in ('strategy','policyVersion','modelVersion','contextVersion','modelContext'))
    cohorts={k:cohort(rs) for k,rs in grouped(selected,key).items()}
    # Same-fixture comparison is descriptive; independent captures may differ in time and price.
    restored={r['fixtureId']:r for r in selected if r['strategy']=='OVER_25_LEGACY_SHADOW'}
    current={r['fixtureId']:r for r in selected if r['strategy']=='OVER_25' and r['policyVersion']==2}
    shared=sorted(restored.keys() & current.keys())
    same_capture=[f for f in shared if restored[f]['qualifiedAt']==current[f]['qualifiedAt']]
    overlap={'n':len(shared),'sameQualificationTime':len(same_capture),
             'maxProbabilityDifference':max([abs(restored[f]['modelProbability']-current[f]['modelProbability']) for f in shared],default=None),
             'restored':cohort([restored[f] for f in shared]) if shared else None,
             'restricted':cohort([current[f] for f in shared]) if shared else None}
    # Frozen opening signal is not necessarily the same prediction-time observation.
    opening_matches=[]
    for r in selected:
        candidates=[s for s in old['signals'] if s['fixtureId']==r['fixtureId'] and s['market']=='OVER_25' and s['side']=='OVER' and s['modelVersion']==r['modelVersion'] and s['contextVersion']==r['contextVersion'] and s['modelContext']==r['modelContext'] and s['openedAt']==r['qualifiedAt']]
        if candidates: opening_matches.append(r['id'])
    report={'version':1,'auditKind':'LOCAL_DATA_QUALITY_AND_OVER_COMPARABILITY','sourceHashes':hashes,
            'cutoffs':{'datasetTo':max(r['kickoff'] for r in rows),'ledgerAsOf':ledger['asOf'],'signalAsOf':old['asOf']},
            'invariants':invariants,'inventoryDuplicates':duplicates,'inventoryConflicts':conflicts,'joinErrors':join_errors,'invalidMetricExamples':invalid_stats[:20],'invalidMetricCount':len(invalid_stats),
            'profile':profile(rows),'byLeague':{str(k):profile(rs) for k,rs in grouped(rows,lambda r:r['leagueId']).items()},
            'byPartition':{k:profile(rs) for k,rs in grouped(rows,partition).items()},
            'xgAge':{k:{'teamObservations':len(rs),'over60Days':sum(r['days']>60 for r in rs),'over120Days':sum(r['days']>120 for r in rs),'maxDays':max(r['days'] for r in rs)} for k,rs in grouped(ages,lambda r:r['partition']).items()},
            'cohorts':cohorts,'excludedOver':dict(exclusions),'resultMismatches':result_mismatches,'pairedPolicies':overlap,'exactOpeningSignalMatches':len(opening_matches),
            'limitations':['No current DB read; local export dates bound conclusions.','Historical statistics publication/revision times and neutral venues unverified.','Signal openings and qualification times cannot be treated as identical prediction times.','Archived and restored Over policies are separate cohorts, not different goal engines.','Missing original quote timestamp/market audit prevents full executable-price certification.','Segments and terminal are previously explored; no new acceptance test or profitable filter selected.'],
            'databaseQueries':0,'providerCalls':0}
    return report

if __name__=='__main__':
    report=audit(); out=ROOT/'.runtime/ai-data-audit'; out.mkdir(exist_ok=True)
    raw=json.dumps(report,indent=2,ensure_ascii=False); path=out/(hashlib.sha256(raw.encode()).hexdigest()+'.json')
    if not path.exists(): path.write_text(raw,encoding='utf8')
    print(json.dumps({'path':str(path),'invariants':report['invariants'],'profile':{k:v for k,v in report['profile'].items() if k not in ('over','leagueOver')},'xgAge':report['xgAge'],'cohorts':{k:{m:v[m] for m in ('n','hits','roi','days','primaryClv','roiDayBlock95')} for k,v in report['cohorts'].items()},'pairedPolicies':{k:report['pairedPolicies'][k] for k in ('n','sameQualificationTime','maxProbabilityDifference')},'exactOpeningSignalMatches':report['exactOpeningSignalMatches']},indent=2))
