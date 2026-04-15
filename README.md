# AI Slot Machines

This repository contains our work for the **Tech Warm-Up: The One Arm AI Slot Machine Experiment**.

The goal of this project is to evaluate how much variation, drift, and quality spread appear when the **same generative AI prompt** is run multiple times under controlled conditions, and to measure what constrained refinement improves over successive rounds.

## Experiment Summary

We generated multiple slot machine web apps using the same baseline prompt and evaluated them as an experiment rather than a normal software project.

### Original Prompt
> Create a slot machine app that uses vanilla web technology like HTML, CSS, JavaScript, and platform APIs. The slot machine should make fun of AI, as in you are winning tokens and spending tokens.

## Experimental Conditions

- **Model used:** GPT-5.2
- **Harness:** Codex CLI with medium reasoning
- **Technology stack:** HTML, CSS, JavaScript
- **Session policy:** Clean session for every run
- **Editing policy:** No manual code edits allowed
- **Refinement policy:** One-shot refinement prompts only

To reduce context contamination between runs, we used `/clear` before each prompt so that previous outputs would not affect later candidates.

## Repository Structure

```text
AI-slotMachines/
├── media/                      # Screenshots, demo assets, and visuals
├── prompts/                    # Original and refinement prompts
├── slides/                     # Presentation slides
├── step1/                      # 50 baseline candidates
├── step2/                      # Top 5 refined candidates
├── step3/                      # Top 3 refined candidates
├── step4/                      # Top 2 refined candidates
├── step5/                      # Final refinement round
├── README.md
├── RUBRIC.md
├── STEP1-RESULTS.md
├── STEP2-RESULTS.md
├── STEP3-RESULTS.md
├── STEP4-RESULTS.md
└── FINAL-REPORT.md
```
## Evaluation Rubric

Candidates were evaluated using the following criteria:

- Functionality
- Simplicity / correct use of tools
- User experience
- Responsiveness / bugs
- Creativity / theme fit
- Polish

More detail is provided in [`RUBRIC.md`](./RUBRIC.md).

## Refinement Workflow

Our refinement process narrowed candidates through multiple rounds:

- **Step 1:** Baseline generation
- **Step 2:** Top 5 selected and refined
- **Step 3:** Top 3 selected and refined
- **Step 4:** Top 2 selected and refined
- **Step 5:** Final refinement and final candidate selection

Each refinement round used a **single new prompt** in a **clean session**, while keeping the same technology stack.

## Key Files

- [`RUBRIC.md`](./RUBRIC.md) — evaluation criteria
- [`STEP1-RESULTS.md`](./STEP1-RESULTS.md) — top 5 baseline candidates and reasoning
- [`STEP2-RESULTS.md`](./STEP2-RESULTS.md) — top 3 after first refinement
- [`STEP3-RESULTS.md`](./STEP3-RESULTS.md) — continued refinement analysis
- [`STEP4-RESULTS.md`](./STEP4-RESULTS.md) — late-stage refinement results
- [`FINAL-REPORT.md`](./FINAL-REPORT.md) — final conclusions and findings

## Notes

- This repository is intended to document an **experiment**, not just a finished game.
- Broken outputs were preserved as part of the data.
- Variation between candidates is expected and is part of the analysis.

## Team

Team 09 — CSE 110  
For questions about the repository or experiment structure, refer to the results files and final report.
