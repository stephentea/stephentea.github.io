---
layout: page
title: RISC-V CPU
description: RISC-V CPU with 7-stage pipeline + data forwarding + branch prediction + L1 cache.
img: assets/img/riscv-project.png
importance: 2
category: course
toc:
  sidebar: left
---

## 🤔 About

As part of [18-447 Computer Architecture](../../courses/#18-447-computer-architecture) 
at CMU, I designed and implemented a [RISC-V](https://riscv.org/) CPU using SystemVerilog. 
Features include a 7-stage pipeline with data forwarding, BTB branch prediction, and an L1 
cache. I used [Synopsys VCS](https://www.synopsys.com/verification/simulation/vcs.html) to 
verify CPU correctness and benchmark performance on programs written in both C and RISC-V 
assembly, and used [Synopsys DC](https://www.synopsys.com/implementation-and-signoff/rtl-synthesis-test/dc-ultra.html) to synthesize the CPU using standard library components to obtain 
information about area, power, timing, etc. 

This page provides simple background information on modern CPU design, technical 
details of this project, and challenges faced. 

## ❓ How do Modern CPUs Work?

To begin with, an **architecture** specifies the interface between the Operating 
System (OS) and the CPU (for example, x86, ARM, SPARC, PowerPC, and more recently, 
RISC-V), whereas **micro-** 
**architecture** refers to the logical design of a CPU - think
of this as interface vs implementation.

The simplest microarchitecture of a CPU is to process 1 instruction every cycle - 
this is referred to a **single-cycle** CPU. However, the clock rate of the CPU would 
be bound by the worst-possible case. This will kill performance - a memory access 
that misses in all levels of CPU caches will take much longer than an addition on 
two registers, and single-cycle forces us to clock the CPU much slower to accomodate 
for the former. 

This is where **pipelining** comes into play. A canonical example is doing laundry. 
Suppose doing laundry requires washing, drying, folding, and placing into the closet - 
this is one full cycle. Instead of doing one cycle at a time, we can overlap each 
cycle to fully utilize every component. A similar idea has been applied to CPUs, 
where a cycle consists of roughly fetch (fetch next instruction) → decode (decode instruction) 
→ execute (execute instruction, for instance using ALU) → writeback (store to register / memory). 

In addition, modern CPUs are designed to exploit **instruction-level parallelism (ILP)** 
by being **superscalar** (multiple instructions in flight at once, for instance, multiple 
functional units for regular and floating point registers) and **out-of-order** (instead 
of executing instructions according to program order, we execute instructions as long as 
data dependency is preserved). Modern CPUs also have sophisticated **branch predictors** 
(to speculatively execute instructions ahead) and **hardware prefetchers** (to minimize 
memory latency).

## 🔍 Our CPU Design

Our CPU adheres to the RISC-V architecture, which was developed at UC Berkeley in 
2010, consisting of a 7-stage pipeline, with data forwarding to resolve hazards (we 
fallback to stalling if a hazard cannot be resolved), BTB branch prediction, and an 
L1 cache which we can access in 2 cycles, instead of 8 cycles for the L2 cache.

We verified correctness using [SystemVerilog assertions](https://www.systemverilog.io/verification/sva-basics/) for basic timing coverage, exhaustive testing of all RISC-V instructions using assembly 
programs, and benchmarked performance using kernels written in C (for instance, Fibonacci recursion, 
integer sort, graph traversals, etc).

For the last 4 weeks of the semester, the entire class competed against each other, 
with points awarded based on how close to [Pareto-optimality](https://en.wikipedia.org/wiki/Pareto_efficiency) our CPU designs are under 2 metrics: MIPS (million instructions per second) and MIPS / Watt. 
There is a fundamental tradeoff between the two metrics: we can improve MIPS by adding more 
sophisticated components such as [Register Allocation Table (RAT)](https://smalldragon.org/html/rat), 
Instruction Queue (IQ), and [Re-order Buffer (ROB)](https://docs.boom-core.org/en/latest/sections/reorder-buffer.html), but doing so will increase both dynamic and static power. 

I focused on achieving a good balance between MIPS and MIPS / Watt. In terms of 
MIPS, I reduced the critical path by changing how we forward data from later stages 
in the pipeline to earlier stages, which increased our clock rate. In terms of power, 
I swept through various parameters for the cache (line size, number of index bits, etc) 
to find the optimal parameters that maximize hit rate to area ratio. 

## 💭 Some Thoughts

Through this project, I realized how complicated debugging hardware can be. 
I spent hours looking at the waveform viewer in Synopsys VCS, tracing through 
signals across different modules.  In addition, running benchmarks and using DC 
to synthesize my design took many, many hours, which led to a much slower development 
cycle. I prefer this less in contrast to software systems, where the development 
cycle is much quicker, i.e. I can make a change to code and see its effects almost instantly. 

## ⭐ Summary 

Overall, I designed a RISC-V CPU entirely from scratch using SystemVerilog, verified 
correctness using SystemVerilog Assertions and test cases in RISC-V assembly, benchmarked 
performance using kernels written in C (compiled down to RISC-V assembly), and synthesized 
the design into library components using Synopsys DC. 

This was a rewarding project, as it enlightened me about the inner workings of a CPU 
as well as other components such as CPU caches and memory system. I believe that anyone 
working with software systems should have a good understanding of the underlying hardware 
to write both correct and performant programs. This project achieved this goal for me, 
especially as I was writing my own [Unix-like kernel for x86](../../projects/1_project) 
concurrently, and I noticed many overlaps. 

My CPU includes many core components of modern CPUs, including pipelining, branch prediction, 
data forwarding, stalling, and accessing L1 caches. In the future, I would like to extend 
this project by designing and implementing proper out-of-order components including the RAT, 
IQ, and ROB. Unfortunately, I cannot post my RTL and FSM diagrams here, but feel free to 
ask me any questions!

*Note: the thumbnail was generated by ChatGPT.*