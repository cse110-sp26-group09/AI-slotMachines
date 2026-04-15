**Team:** Akatsuki, 09 
**Date:** April 2026  

-----

## Executive Summary
The AI does produce functional games pretty consistently. But one thing to keep in mind is that once we start to get more and more in-the-weeds and train it on increasingly more and more data, it just gets worse and worse. They all look so similar. The candidates, overall, gave very verbose code that created very basic and lacking-in-personality webpages. The refinement processes gave us very mixed results. For example, we would, first pass, get decent output, refine it, make it better, refine it, make it better, then the output would start getting worse and worse. This is textbook "overcooking."

## Methodology

  * **Model:** GPT 5.2 Medium
  * **Interface:** Codex

-----

## The Baseline (Phase 2 Data)

The 50 candidates varied in how they handled tokens, timing, and execution flow, some treated tokens like a counter that updated instantly, while others tried to simulate resource usage over time, introducing delays or “cooldowns” between spins. In a few cases, the logic around minutes or timing felt inconsistent, with animations or token updates happening out of sync, especially when actions were triggered rapidly. Overall, some implementations managed these systems cleanly and predictably, while others showed drift where timing and token logic became buggy or unreliable.

### Quantitative Summary


| **Wall-clock Time (s)** around 20 minutes
| **Output Tokens** around 130k
| **Lines of Code (LOC)** around 1000

### **Observations on "Drift"**


  * **Visual Drift:** There would be visual flairs. There are particle effects. There are increased animations.
  * **Logic Drift:** The code itself stayed in the same style. There's a very distinct kind of code that AI writes which is very polished and uniform.
    This is evident in every piece of code we generated.
-----

### 50 -> 5 -> 3 -> 2 -> 1

  * **Candidates:** `001`, `018`, `019`, `024`, `041` -> `001`, `019`, `041`-> `019`, `041` -> `041`
  * **Selection Logic:** We prioritized functional sound effects.

### Refinement Rounds

As I kept refining, I started noticing new issues popping up, like emoji rendering errors, visual glitches, 
and buttons not giving proper feedback or responding correctly. So while the model generally did fix the problems 
I pointed out, it also introduced smaller, unintended bugs along the way, meaning each iteration solved some issues 
but created new ones I had to catch and address.

-----

## Final Candidate Showcase

  * **Winner:** https://github.com/cse110-sp26-group09/AI-slotMachines/tree/main/step5
  * **Key Features:** Smooth animations, better audio, UX better, more fun
  * **Known Issues:** Emojis didn't perfectly show all the time. Visual glitches were very prevalent.

-----

## Appendices & Links

  * RUBRIC.md: https://github.com/cse110-sp26-group09/AI-slotMachines/blob/main/RUBRIC.md
  * Original Prompt: https://github.com/cse110-sp26-group09/AI-slotMachines/blob/main/prompts/original-prompt.txt
  * Step 1 Results: https://github.com/cse110-sp26-group09/AI-slotMachines/tree/main/step1
