# openclaw-job-handoff — 수습 기간(업무 인수인계) 스킬

OpenClaw 비서 팀에게 **주인의 업무 1개를 사람 신입처럼 인수인계**하는 스킬이다. AI 직원은 대화가 끝나면 잊는다. 그래서 가르친 내용을 전부 **업무 설명서**에 적고, 직원은 일할 때마다 그 설명서를 먼저 읽고, 틀릴 때마다 설명서가 고쳐진다. **고쳐진 설명서 = 직원의 성장.**

- 총괄이 **7문항 인터뷰**(왜·언제·무엇을 보고·순서·판단 기준·좋은 결과·하면 안 되는 것)를 한 번에 하나씩 묻고 설명서(job.md)를 만든다.
- 이어서 **기준 시간**(주인이 직접 하면 1건에 몇 분)을 묻는다. 맡기기 전 값이라 나중에 전후 비교의 출발점이 된다.
- 주인이 지난 결과물 3개를 건네면 **"이때 왜 이렇게 판단하셨어요?"** 를 되물어 사례로 저장한다.
- 담당 직원이 **되말하기**(내가 이해한 순서 + 헷갈리는 곳 2개)를 한다.
- 매일 보고를 주인이 **👍 ✏️ ❌ + 한 줄**로 채점한다(대화 · 텔레그램 문장 · [대시보드](https://github.com/IrumHahn/openclaw-personal-dashboard) 「수습」 메뉴). ✏️·❌ 면 직원이 틀린 이유를 짐작해 설명서 수정안을 묻고, 승인한 것만 고친다.
- 매주 일요일 21:50 **수습 성적표**: 처리 건수 · 내가 고친 횟수 · 그대로 쓴 비율 · 아낀 시간(추정)을 지난주와 비교해 보낸다. 대시보드 「수습」 메뉴에는 그래프로 보인다.
- 채점표가 조건을 채우면 직원이 먼저 승급을 제안한다: **L0 견습 → L1 따라하기 → L2 같이 하기 → L3 혼자 하기 → L4 가르치기.**

```
인터뷰(총괄) ─▶ job.mjs 설명서 v1 ─▶ case.mjs 사례 3개 ─▶ 되말하기 report --kind talkback
     ─▶ 매일 report.mjs ─▶ 주인 👍 ✏️ ❌ ─▶ grade.mjs ─▶ (✏️❌) 가설 · 수정안 · 승인 ─▶ job.mjs --lesson
     ─▶ level.mjs check / promote --approved
```

## 업무 폴더 (담당 직원 작업 폴더 안 `jobs/<업무 id>/`)

| 파일 | 뜻 |
|---|---|
| `job.md` | 업무 설명서 (판마다 `versions/` 에 백업) |
| `cases/` | 사례: 입력 · 대표의 판단과 이유 · 결과 |
| `lessons.md` | 배운 것 일지 (날짜순 한 줄) |
| `record.md` | 채점표 · 지금 단계 · 통과 조건 · 진행 (`state.json` 에서 그려 냄) |
| `boundary.md` | 묻기 규칙: 먼저 묻기 / 하고 나서 보고 / 절대 하지 않기 |
| `reports/` | 보고 원문 |

총괄 작업 폴더의 `jobs/index.json`·`INDEX.md` 가 어떤 업무가 누구에게 있는지 기억한다. 업무를 시작하면 담당 직원의 `AGENTS.md` 에 "이 업무는 설명서 먼저" 구역이 자동으로 들어간다(표시 사이만, 처음 고칠 때 백업, `hook.mjs --remove` 로 뺌).

## 승급 조건

| 지금 단계 | 통과 조건 |
|---|---|
| L0 견습 | 되말하기 👍 |
| L1 따라하기 | 새 대화에서 재현 시험 연속 👍 3건 |
| L2 같이 하기 | 실제 보고 연속 👍 5번 |
| L3 혼자 하기 | 재현 시험 연속 👍 3건 + '먼저 묻기' 1개를 '하고 나서 보고'로 |
| L4 가르치기 | 다른 직원이 이 설명서만 보고 1건 처리해 👍 → 수료 |

## 설치 (OpenClaw 2026.10 기준)

```bash
cd ~
git clone https://github.com/IrumHahn/openclaw-job-handoff.git
openclaw skills install ./openclaw-job-handoff/skill/job-handoff --as job-handoff --agent main
openclaw skills install ./openclaw-job-handoff/skill/job-handoff --as job-handoff --agent <팀원 id>   # 수습시킬 팀원마다
openclaw skills list --agent main | grep job-handoff                                     # 직원이 여럿이면 --agent 가 필요해요
```

그다음 총괄에게: **"<팀원>에게 <업무> 업무 인수인계 시작해 줘."**

## 성장 노트(self-improve)와 함께 쓸 때

[성장 노트](https://github.com/IrumHahn/openclaw-self-improve)는 모든 일에 통하는 습관(말투·형식·도구 요령)을, 수습은 업무 1개의 설명서를 키운다. 수습 업무에서 받은 채점·교정은 이 스킬로만 처리하고 성장 노트에는 메모하지 않는다(양쪽 안내 구역에 같은 규칙이 있다).

## 개발

```bash
node --test tests/*.test.mjs
```
npm 의존성 없음, Node 22.
