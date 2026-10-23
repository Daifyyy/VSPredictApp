"""Offline worker. Receives a frozen matrix; never imports database or provider clients."""
import os
for key in ('OMP_NUM_THREADS', 'OPENBLAS_NUM_THREADS', 'MKL_NUM_THREADS', 'NUMEXPR_NUM_THREADS'):
    os.environ[key] = '2'
import hashlib
import json
import sys
import time
from datetime import datetime, timezone, timedelta
from pathlib import Path
import numpy as np
from sklearn.linear_model import LogisticRegression
from sklearn.preprocessing import StandardScaler
from catboost import CatBoostClassifier

START = time.monotonic()
FITS = 0

def softmax(z):
    z = z - np.max(z, axis=1, keepdims=True)
    exp = np.exp(z)
    return exp / exp.sum(axis=1, keepdims=True)

def metrics(y, p):
    k = p.shape[1]
    actual = np.eye(k)[y]
    brier = np.sum((p-actual)**2, axis=1) / (2 if k == 2 else 1)
    bins, eces = [], []
    for c in range(k):
        per_bin = []
        for b in range(10):
            mask = np.minimum(9, (p[:, c]*10).astype(int)) == b
            n = int(mask.sum())
            per_bin.append({'lower': b/10, 'n': n, 'predicted': float(p[mask, c].mean()) if n else None,
                            'actual': float(actual[mask, c].mean()) if n else None})
        eces.append(sum(b['n'] * abs(b['predicted']-b['actual']) for b in per_bin if b['n']) / len(y))
        bins.append(per_bin)
    return {'n': len(y), 'logLoss': float(-np.log(np.clip(p[np.arange(len(y)), y], 1e-12, 1)).mean()),
            'brier': float(brier.mean()), 'accuracy': float((p.argmax(axis=1)==y).mean()), 'ece': eces, 'calibration': bins}

def impute_fit(x):
    return np.array([float(np.median(c[np.isfinite(c)])) if np.isfinite(c).any() else 0. for c in x.T])

def impute(x, med):
    return np.where(np.isfinite(x), x, med)

def fit_model(x, y, cfg, protocol, validation=None, iterations=600):
    global FITS
    if FITS >= protocol['maxFits'] or time.monotonic()-START >= protocol['maxSeconds']:
        raise RuntimeError('BUDGET_EXCEEDED')
    FITS += 1
    if len(np.unique(y)) != (3 if cfg['market']=='ONE_X_TWO' else 2):
        raise RuntimeError('INSUFFICIENT_CLASS_COVERAGE')
    med = impute_fit(x)
    z = impute(x, med)
    scale = StandardScaler().fit(z) if cfg['kind']=='LOGISTIC' else None
    if scale is not None:
        model = LogisticRegression(C=cfg['C'], max_iter=1000, solver='lbfgs', random_state=protocol['seed'])
        model.fit(scale.transform(z), y)
        if int(model.n_iter_.max()) >= 1000:
            raise RuntimeError('LOGISTIC_NOT_CONVERGED')
    else:
        model = CatBoostClassifier(iterations=iterations, depth=cfg['depth'], l2_leaf_reg=cfg['l2'], learning_rate=.03,
            loss_function='MultiClass' if cfg['market']=='ONE_X_TWO' else 'Logloss', thread_count=2,
            random_seed=protocol['seed'], verbose=False, allow_writing_files=False, task_type='CPU')
        kwargs = {} if validation is None else {'eval_set': (impute(validation[0], med), validation[1]), 'early_stopping_rounds':50}
        model.fit(z, y, **kwargs)
    return model, med, scale

def predict(fitted, x):
    model, med, scale = fitted
    z = impute(x, med)
    return model.predict_proba(scale.transform(z) if scale is not None else z)

def segmentation(y, candidate, base, leagues, protocol):
    result = []
    for league in sorted(set(leagues.tolist())):
        mask = leagues == league
        if int(mask.sum()) < protocol['segmentMinN']:
            continue
        a, b = metrics(y[mask], candidate[mask]), metrics(y[mask], base[mask])
        result.append({'leagueId': int(league), 'n': int(mask.sum()), 'candidateLogLoss': a['logLoss'],
                       'baselineLogLoss': b['logLoss'], 'acceptable': a['logLoss'] <= b['logLoss']*(1+protocol['segmentMaxLoss'])})
    return result

def evaluate_config(x, y, columns, cfg, folds, leagues, protocol):
    ps, ys, ls, indices, fold_metrics, iterations = [], [], [], [], [], []
    for train, valid in folds:
        model = fit_model(x[train][:,columns], y[train], cfg, protocol, (x[valid][:,columns],y[valid]))
        p = predict(model, x[valid][:,columns])
        ps.append(p); ys.append(y[valid]); ls.append(leagues[valid]); indices.extend(valid.tolist())
        fold_metrics.append(metrics(y[valid], p))
        iterations.append(int(getattr(model[0], 'tree_count_', 600)))
    return {'config':cfg, 'columns':columns, 'p':np.concatenate(ps), 'y':np.concatenate(ys), 'leagues':np.concatenate(ls),
            'indices':np.array(indices), 'folds':fold_metrics, 'iterations':int(np.median(iterations)),
            'metrics':metrics(np.concatenate(ys),np.concatenate(ps))}

def export_model(fitted, cfg, columns, feature_names, temperature, dataset_hash, protocol_hash, root):
    model, med, scaler = fitted
    result = {'version':1, 'market':cfg['market'], 'featureNames':feature_names, 'selectedFeatures':columns,
              'impute':med.tolist(), 'offset':scaler.mean_.tolist() if scaler is not None else [0.]*len(columns),
              'scale':scaler.scale_.tolist() if scaler is not None else [1.]*len(columns), 'temperature':temperature,
              'datasetHash':dataset_hash, 'protocolHash':protocol_hash, 'status':'RESEARCH_CANDIDATE'}
    if cfg['kind']=='LOGISTIC':
        result.update(kind='LOGISTIC',coefficients=model.coef_.tolist(),intercept=model.intercept_.tolist())
    else:
        tmp = root / 'catboost-export.json'
        model.save_model(str(tmp), format='json')
        raw = json.loads(tmp.read_text(encoding='utf8')); tmp.unlink()
        k = 3 if cfg['market']=='ONE_X_TWO' else 1
        trees = []
        for t in raw['oblivious_trees']:
            splits = t.get('splits') or []
            if any(s['split_type'] != 'FloatFeature' for s in splits): raise RuntimeError('UNSUPPORTED_EXPORT_SPLIT')
            values = np.array(t['leaf_values']).reshape(-1,k).tolist()
            trees.append({'splits':[{'feature':s['float_feature_index'],'border':s['border']} for s in splits], 'leaves':values})
        scale, bias = raw.get('scale_and_bias',[1.,[0.]*k])
        result.update(kind='CATBOOST_NUMERIC',trees=trees,multiplier=scale,bias=bias)
    return result

def clean_run(r):
    return {k:v for k,v in r.items() if k not in ('p','y','leagues','indices')}

def temporal_split(rows):
    days = sorted(set(r['day'] for r in rows))
    if len(days) < 10: raise RuntimeError('INSUFFICIENT_DAYS')
    boundaries = [int(len(days)*p) for p in (.4,.5,.6,.7,.8)]
    day_index = {d:i for i,d in enumerate(days)}; positions = np.array([day_index[r['day']] for r in rows])
    folds = [(np.where(positions<a)[0],np.where((positions>=a)&(positions<b))[0]) for a,b in zip(boundaries[:3],boundaries[1:4])]
    return folds, np.where(positions<boundaries[3])[0], np.where((positions>=boundaries[3])&(positions<boundaries[4]))[0], np.where(positions>=boundaries[4])[0]

def audit_rows(rows):
    if len({r['fixtureId'] for r in rows}) != len(rows): raise RuntimeError('DUPLICATE_FIXTURE')
    for r in rows:
        origin = datetime.fromisoformat(r['day']).replace(tzinfo=timezone.utc)
        kickoff = datetime.fromisoformat(r['kickoff'].replace('Z','+00:00'))
        if kickoff.date() != origin.date() or r['outcome'] not in (0,1,2) or r['over'] not in (0,1): raise RuntimeError('INVALID_ROW')
        latest = r['latestHistory']
        if latest and datetime.fromisoformat(latest.replace('Z','+00:00')) + timedelta(hours=3) >= origin: raise RuntimeError('AI_FEATURE_LEAKAGE')

def run(path, output):
    raw = path.read_bytes(); data_hash = hashlib.sha256(raw).hexdigest(); data = json.loads(raw)
    if path.name != data_hash+'.dataset.json' or data['version']!=1: raise RuntimeError('DATASET_HASH_MISMATCH')
    protocol = data['protocol']; rows = data['rows']; audit_rows(rows)
    folds, development, calibration, terminal = temporal_split(rows)
    report = {'version':1,'datasetHash':data_hash,'protocolHash':data['protocolHash'],'status':'INSUFFICIENT_DATA',
              'partitions':{'development':len(development),'calibration':len(calibration),'terminal':len(terminal),'firstFoldTraining':len(folds[0][0])},
              'kind':data['kind'],'independentHoldout':data['independentHoldout'],'limitations':data['limitations'],
              'profitability':{'status':'UNAVAILABLE_NO_EXECUTABLE_PRICE_HISTORY'},'activation':False}
    checkpoint = lambda: (output/'report.partial.json').write_text(json.dumps(report,indent=2),encoding='utf8')
    checkpoint()
    if len(folds[0][0])<protocol['minTrain'] or len(calibration)<protocol['minCalibration'] or len(terminal)<protocol['minTerminal'] or any(len(v)==0 for _,v in folds):
        return report
    x = np.array([r['values'] for r in rows],dtype=float)
    if x.shape[1] != len(data['featureNames']) or np.isinf(x).any(): raise RuntimeError('INVALID_FEATURE_MATRIX')
    leagues = np.array([r['leagueId'] for r in rows]); feature_groups = np.array(data['featureGroups'])
    winners = []; report['markets'] = {}
    for market in ('ONE_X_TWO','OVER_25'):
        y = np.array([r['outcome'] if market=='ONE_X_TWO' else r['over'] for r in rows])
        base = np.array([r['baseline']['oneXTwo'] if market=='ONE_X_TWO' else [1-r['baseline']['over'],r['baseline']['over']] for r in rows])
        if not np.isfinite(base).all() or not np.allclose(base.sum(axis=1),1) or (base<0).any(): raise RuntimeError('INVALID_BASELINE')
        reference = {'kind':'CATBOOST','depth':4,'l2':10,'market':market}
        kept = [1]; ablations = []
        previous = evaluate_config(x,y,np.where(feature_groups==1)[0].tolist(),reference,folds,leagues,protocol)
        ablations.append({'group':1,'kept':True,'metrics':previous['metrics']})
        for group in range(2,7):
            columns = np.where(np.isin(feature_groups,kept+[group]))[0].tolist()
            candidate = evaluate_config(x,y,columns,reference,folds,leagues,protocol)
            gain = 1-candidate['metrics']['logLoss']/previous['metrics']['logLoss']
            segments = segmentation(candidate['y'],candidate['p'],previous['p'],candidate['leagues'],protocol)
            accept = gain>=protocol['ablationGain'] and all(s['acceptable'] for s in segments)
            ablations.append({'group':group,'kept':accept,'relativeGain':gain,'metrics':candidate['metrics'],'segments':segments})
            if accept: kept.append(group); previous=candidate
            report['markets'][market]={'ablations':ablations}; checkpoint()
        columns = np.where(np.isin(feature_groups,kept))[0].tolist()
        configs = [{'kind':'LOGISTIC','C':c,'market':market} for c in (.1,1.,10.)] + [{'kind':'CATBOOST','depth':d,'l2':l,'market':market} for d in (4,6) for l in (3,10)]
        runs = [evaluate_config(x,y,columns,cfg,folds,leagues,protocol) for cfg in configs]
        runs.sort(key=lambda r:(r['metrics']['logLoss'],r['config']['kind']!='LOGISTIC',len(r['columns'])))
        best = runs[0]; baseline = metrics(best['y'],base[best['indices']]); best['gain']=1-best['metrics']['logLoss']/baseline['logLoss']
        best['keptGroups']=kept; best['baseline']=baseline; best['market']=market
        league_base = np.array([r['leagueBaseline']['oneXTwo'] if market=='ONE_X_TWO' else [1-r['leagueBaseline']['over'],r['leagueBaseline']['over']] for r in rows])
        best['leagueBaseline'] = metrics(best['y'],league_base[best['indices']])
        report['markets'][market]={'ablations':ablations,'candidates':[clean_run(r) for r in runs], 'selected':clean_run(best)}
        winners.append(best); checkpoint()
    # Choose before opening terminal outcomes. No replacement after failed final test.
    winners.sort(key=lambda w:(-w['gain'],w['config']['kind']!='LOGISTIC',len(w['columns']),w['market']))
    winner=winners[0]; market=winner['market']; columns=winner['columns']
    report['selectedMarket']=market; report['selectedConfig']=winner['config']
    y=np.array([r['outcome'] if market=='ONE_X_TWO' else r['over'] for r in rows])
    base=np.array([r['baseline']['oneXTwo'] if market=='ONE_X_TWO' else [1-r['baseline']['over'],r['baseline']['over']] for r in rows])
    fitted=fit_model(x[development][:,columns],y[development],winner['config'],protocol,iterations=winner['iterations'])
    calibration_p=predict(fitted,x[calibration][:,columns]); logp=np.log(np.clip(calibration_p,1e-12,1))
    temperatures=np.exp(np.linspace(np.log(.5),np.log(3),81))
    temperature=float(min(temperatures,key=lambda t:metrics(y[calibration],softmax(logp/t))['logLoss']))
    terminal_p=predict(fitted,x[terminal][:,columns]); terminal_p=softmax(np.log(np.clip(terminal_p,1e-12,1))/temperature)
    final=metrics(y[terminal],terminal_p); final_base=metrics(y[terminal],base[terminal])
    segments=segmentation(y[terminal],terminal_p,base[terminal],leagues[terminal],protocol)
    fold_gains=[1-f['logLoss']/metrics(y[v],base[v])['logLoss'] for f,(_,v) in zip(winner['folds'],folds)]
    dev_segments = segmentation(winner['y'],winner['p'],base[winner['indices']],winner['leagues'],protocol)
    gates={'developmentGain':winner['gain']>=protocol['minimumGain'],'terminalGain':1-final['logLoss']/final_base['logLoss']>=protocol['minimumGain'],
           'twoPositiveFolds':sum(g>0 for g in fold_gains)>=2,'brier':final['brier']<=final_base['brier'],
           'calibration':max(final['ece'])<=protocol['maxEce'],'segments':all(s['acceptable'] for s in segments),
           'developmentBrier':winner['metrics']['brier']<=winner['baseline']['brier'],
           'developmentSegments':all(s['acceptable'] for s in dev_segments),
           'venueEligibilityVerified':bool(data['venueMetadataVerified'])}
    report.update(status='SHADOW_CANDIDATE' if all(gates.values()) else 'REJECTED',gates=gates,terminal={'candidate':final,'baseline':final_base,'segments':segments},
                  temperature=temperature,foldRelativeGains=fold_gains,keptGroups=winner['keptGroups'],fits=FITS)
    report['developmentSegments'] = dev_segments
    league_base = np.array([r['leagueBaseline']['oneXTwo'] if market=='ONE_X_TWO' else [1-r['leagueBaseline']['over'],r['leagueBaseline']['over']] for r in rows])
    report['terminal']['leagueBaseline'] = metrics(y[terminal],league_base[terminal])
    # Candidate is not a registry entry. Runtime parity and resource gates still must pass.
    artifact=export_model(fitted,winner['config'],columns,data['featureNames'],temperature,data_hash,data['protocolHash'],output)
    artifact_json=json.dumps(artifact,separators=(',',':'))
    if len(artifact_json.encode())>protocol['maxArtifactBytes']: raise RuntimeError('ARTIFACT_TOO_LARGE')
    (output/'candidate.for-parity.json').write_text(artifact_json,encoding='utf8')
    parity_indices=terminal[:min(100,len(terminal))]
    expected=softmax(np.log(np.clip(predict(fitted,x[parity_indices][:,columns]),1e-12,1))/temperature)
    fixtures=[{'values':rows[int(i)]['values'],'expected':p.tolist() if market=='ONE_X_TWO' else [float(p[1])]} for i,p in zip(parity_indices,expected)]
    (output/'parity.json').write_text(json.dumps(fixtures),encoding='utf8')
    return report

def main():
    path, output = Path(sys.argv[1]).resolve(), Path(sys.argv[2]).resolve()
    try:
        report=run(path,output)
        report['runtime']={'seconds':time.monotonic()-START,'fits':FITS,'threads':2,'databaseQueries':0,'providerCalls':0}
        (output/'report.json').write_text(json.dumps(report,indent=2),encoding='utf8')
        print(json.dumps({'status':report['status'],'selectedMarket':report.get('selectedMarket'),'partitions':report['partitions'],'runtime':report['runtime'],'gates':report.get('gates')}),flush=True)
    except Exception as error:
        (output/'failure.json').write_text(json.dumps({'status':'BUDGET_EXCEEDED' if 'BUDGET' in str(error) else 'FAILED','error':str(error),'fits':FITS}),encoding='utf8')
        raise

if __name__=='__main__': main()
