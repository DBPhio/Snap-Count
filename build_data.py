#!/usr/bin/env python3
"""Build SNAP COUNT data files from nflverse releases."""
import csv, json, sys, urllib.request, io, os

BASE="https://github.com/nflverse/nflverse-data/releases/download"
SEASONS=[2026,2025]
OFF={'QB','RB','FB','WR','TE','K'}
OUT=os.path.join(os.path.dirname(os.path.abspath(__file__)),"data")

def get(url):
    print("  fetch",url.split("/")[-1],file=sys.stderr)
    with urllib.request.urlopen(url) as r: return io.StringIO(r.read().decode("utf-8","replace"))

def f(v):
    try: return float(v)
    except: return 0.0
def i(v): return int(round(f(v)))

def build_players():
    rows=list(csv.DictReader(get(f"{BASE}/rosters/roster_2026.csv")))
    out={}
    KEEP={'ACT':'','RES':'IR','INA':'INA','PUP':'PUP','NON':'NFI'}
    for r in rows:
        st=r.get('status','')
        if st not in KEEP: continue
        pos=r.get('position','')
        if pos not in OFF: continue
        gid=r.get('gsis_id','').strip()
        if not gid: continue
        out[gid]={
          "n":r.get('full_name','').strip(),
          "t":r.get('team','').strip(),
          "p":'RB' if pos=='FB' else pos,
          "j":r.get('jersey_number','').split('.')[0],
          "e":r.get('espn_id','').split('.')[0],
          "h":r.get('headshot_url','').strip(),
          "c":r.get('college','').strip(),
          "y":r.get('years_exp','').split('.')[0],
          "s":KEEP[st],                      # "" = active, else IR / PUP / INA
        }
    return out

def build_weekly(season, valid):
    try: rows=list(csv.DictReader(get(f"{BASE}/stats_player/stats_player_week_{season}.csv")))
    except Exception as e:
        print("  skip",season,e,file=sys.stderr); return []
    out=[]
    for r in rows:
        if r.get('season_type')!='REG': continue
        gid=r.get('player_id','')
        if gid not in valid: continue
        kick=3*(f(r['fg_made_0_19'])+f(r['fg_made_20_29'])+f(r['fg_made_30_39']))+4*f(r['fg_made_40_49'])+5*(f(r['fg_made_50_59'])+f(r['fg_made_60_']))+f(r['pat_made'])
        rec=i(r['receptions'])
        ppr=f(r['fantasy_points_ppr']) or kick
        std=f(r['fantasy_points']) or kick
        # offensive fumbles only — fumbles_lost_total also counts return fumbles,
        # which conventional fantasy scoring doesn't charge to the player
        fumlost=i(r.get('sack_fumbles_lost',0))+i(r.get('rushing_fumbles_lost',0))+i(r.get('receiving_fumbles_lost',0))
        two=i(r.get('passing_2pt_conversions',0))+i(r.get('rushing_2pt_conversions',0))+i(r.get('receiving_2pt_conversions',0))
        sptd=i(r.get('special_teams_tds',0))
        row=[gid,i(r['week']),r['team'],r['opponent_team'],
             i(r['completions']),i(r['attempts']),i(r['passing_yards']),i(r['passing_tds']),i(r['passing_interceptions']),
             i(r['carries']),i(r['rushing_yards']),i(r['rushing_tds']),
             i(r['targets']),rec,i(r['receiving_yards']),i(r['receiving_tds']),
             fumlost,i(r['fg_made']),i(r['pat_made']),
             round(std,1),round(ppr,1),sptd,two]
        if any(row[4:19]) or sptd or two or fumlost: out.append(row)
    return out

DST_ROW_DOC = """DST weekly row:
[team, week, opp, pts_allowed, yds_allowed, sacks, ints, fum_rec, def_tds, safeties, st_tds]"""
def build_dst(seasons):
    # game scores -> points allowed
    scores={}
    try:
        for g in csv.DictReader(get("https://raw.githubusercontent.com/nflverse/nfldata/master/data/games.csv")):
            if g.get('game_type')!='REG': continue
            try: s,w=int(g['season']),int(g['week'])
            except: continue
            if g.get('home_score') in ('','NA',None): continue
            scores[(s,w,g['home_team'])]=f(g['away_score'])
            scores[(s,w,g['away_team'])]=f(g['home_score'])
    except Exception as e:
        print("  score fetch failed:",e,file=sys.stderr)
    out={}
    for season in seasons:
        rows=[]
        try: data=list(csv.DictReader(get(f"{BASE}/stats_team/stats_team_week_{season}.csv")))
        except Exception as e:
            print("  skip dst",season,e,file=sys.stderr); out[season]=[]; continue
        for r in data:
            if r.get('season_type')!='REG': continue
            tm,wk=r['team'],i(r['week'])
            pa=scores.get((season,wk,tm))
            yds=f(r.get('passing_yards',0))+f(r.get('rushing_yards',0))
            rows.append([tm,wk,r.get('opponent_team',''),
                         -1 if pa is None else i(pa), i(yds),
                         i(r.get('def_sacks',0)), i(r.get('def_interceptions',0)),
                         i(r.get('fumble_recovery_opp',0)), i(r.get('def_tds',0)),
                         i(r.get('def_safeties',0)), i(r.get('special_teams_tds',0))])
        out[season]=rows
    return out

if __name__=="__main__":
    os.makedirs(OUT,exist_ok=True)
    print("building players…",file=sys.stderr)
    players=build_players()
    json.dump(players,open(f"{OUT}/players.json","w"),separators=(',',':'))
    print(f"  {len(players)} active offensive players",file=sys.stderr)
    for s in SEASONS:
        print(f"building weekly {s}…",file=sys.stderr)
        wk=build_weekly(s,players)
        json.dump({"season":s,"rows":wk},open(f"{OUT}/weekly_{s}.json","w"),separators=(',',':'))
        weeks=sorted(set(r[1] for r in wk))
        print(f"  {len(wk)} stat lines, weeks {weeks[:1]}–{weeks[-1:]}",file=sys.stderr)
    print("building team defenses…",file=sys.stderr)
    dst=build_dst(SEASONS)
    for s in SEASONS:
        json.dump({"season":s,"rows":dst[s]},open(f"{OUT}/dst_{s}.json","w"),separators=(',',':'))
        print(f"  {s}: {len(dst[s])} defense lines",file=sys.stderr)
    meta={"built":__import__("datetime").datetime.now(__import__("datetime").timezone.utc).isoformat(),"seasons":SEASONS,"players":len(players)}
    json.dump(meta,open(f"{OUT}/meta.json","w"))
