---
layout: page
title: x86 Kernel + Hypervisor
description: Pebbles Kernel and PebPeb Hypervisor.
img: assets/img/pebbles-project.png
importance: 1
category: course
related_publications: false
toc:
  sidebar: left
---

## 💭 About

As part of [15-410 Operating System Design and Implementation](../../courses/#15-410-operating-system-design--implementation) at CMU, I wrote a 
userspace thread library, Unix-like kernel for x86-32, and basic hypervisor. 
Everything was written entirely from scratch using C and x86 Assembly, with a 
friend. This page highlights the technical details, design decisions, and 
challenges faced for this project. 

## 📚 Userspace Thread Library

I designed and implemented a 1-to-1 userspace thread library, along with 
four types of synchronization objects: mutex, condition variable, semaphore, 
and reader-writer (shared-exclusive) locks. In addition, I wrote a page-fault 
handler to transparently expand a userspace thread's stack. 

The thread library supports the following functions:

- `thr_init()` - initializes the thread library
- `thr_create()` - spawns a new userspace thread to run a given function
- `thr_join()` - waits on another thread to exit, then returns its exit status
- `thr_exit()` - exits the current thread with a specified exit status
- `thr_getid()` - returns the ID of the currently running thread
- `thr_yield()` - defers execution of the invoking thread in favor of a specified thread

One of the trickiest aspects of this project is properly synchronizing `thr_join()`, 
`thr_exit()`, and `thr_yield()`, which can have many negative interactions between 
each other. For instance, what happens if a thread calls `thr_join()` on a thread 
that has called `thr_exit()`, but another thread calls `thr_join()` and frees the 
exited thread's resources first? 

In addition, careful thought was required to design high-performant synchronization 
objects. For instance, for a uniprocessor, if a mutex cannot be acquired, we should 
immediately yield to another thread instead of trying to acquire a lock that can 
never be released until the lock-holder runs. 

But for a multiprocessor, things become trickier. Can a mutex simply be a spinlock 
on the `XCHG` instruction?  This may be fine if the mutex is low-contention, but if 
many threads spin on `XCHG`, the interconnect will be flooded with cache coherency 
messages, which significantly degrades performance.  Hence, we must consider other 
mutex designs, such as ticket locks, random backoff, etc. 

## 💻 Pebbles Kernel for x86

Pebbles is a Unix-like kernel for x86-32. Unlike OS implementation classes at 
other universities, which often only require students to implement parts of an OS 
(for example, scheduler, virtual memory, disk driver), 15-410 requires students to 
implement an OS kernel entirely from scratch. This required around 15,000 lines of 
C code, along with around 2,000 lines of x86 assembly.

Our Pebbles kernel consists of an ELF loader, virtual memory (with ZFOD support), 
scheduler, device drivers for timer, console, and keyboard, and supports 24 system calls:

- `deschedule()` - block until some event
- `exec()` - execute a new program
- `fork()` - clone a process
- `gettid()` - get thread ID
- `halt()` - halt the processor (or [Simics](https://www.windriver.com/products/simics))
- `make_runnable()` - make another thread runnable
- `new_pages()` - request virtual pages
- `readfile()` - read from an ELF file into a buffer
- `remove_pages()` - remove virtual pages
- `set_status()` - set exit status for invoking process
- `sleep()` - sleep for specified number of ticks
- `swexn()` - install user-defined software exception handler
- `thread_fork` - clone a thread
- `vanish()` - exit a thread (if last in process, exit process)
- `wait()` - reap an exited thread and return exit status
- `yield()` - deschedule current thread, schedule specified thread
- `readline()` - block until a line is available from keyboard buffer
- `print()` - print buffer into console
- `set_term_color()` - set color of console
- `set_cursor_pos()` - set cursor position of console
- `get_cursor_pos()` - get cursor position of console

I learned many, many lessons while implementing Pebbles, which I've highlighted 
below:

### Data Structures

As with any complex system, data structure design is key for performance and 
modularity. You will be tempted with many options for data structures: linked lists, 
bitmaps, hash dictionaries, self-balancing trees, B-trees, and more. While it may 
be tempting to choose the most-sophisticated data structure for the job, sometimes 
simple is best. 

For instance, threads can call `sleep()` to specify the number of seconds to sleep 
for, before the kernel wakes it up and schedules it normally. What data structure 
do we use for this queue of sleeping threads?  Do we use a linked list, self-balancing 
tree, hash dictionary, or something else?  Considering that we must search quickly for 
threads to wake up (as this routine happens in a timer handler), a linked list may not 
be a good idea.  But a hash dictionary may be too complex to manage.  

Design decisions like this are very common in not only kernel development, but 
other software systems as well.  Software engineers constantly make the tradeoff 
between designing the perfect - however complex - data structure for a problem, 
versus maintainability and engineering cost. Given that students only have 6 weeks 
for the Pebbles kernel, careful consideration is needed (do you really want to be 
debugging your splay tree right before the deadline?)

### Synchronization

Synchronization is one of the hardest aspects of kernel development. Linux alone 
uses many types of synchronization objects, include semaphores, mutexes, condition 
variables, reader-writer locks, etc.  As almost every machine is multicore now, 
designing high-performant locks and proper synchronization become even more important. 

To correctly synchronize across two system calls (for example, one kernel thread 
calls `vanish()` while another calls `wait()`), the easiest method would be to 
serialize these two calls, for example, by forcing these system calls to acquire 
a mutex before entering the body (in fact, the Linux kernel did something like this -
the [Big Kernel Lock](https://kernelnewbies.org/BigKernelLock) - when first 
transitioning from uni-processor to multi-processor support).

Another example is virtual memory related system calls. For instance, if we only 
have a single lock on the virtual memory struct (we call it `mm_struct` for memory- 
management), then only one kernel thread is allowed to modify its virtual memory 
at a time, despite there being much more room for parallelism - two threads from 
different processes, or touching non-overlapping regions of virtual memory should 
definitely be allowed to proceed in parallel. 

Therefore, I spent a lot of time designing fine-grained synchronization 
while ensuring correctness. This ties into my comment above about designing 
suitable data structures. For instance, I use AVL trees (Linux uses red-black 
trees) to manage virtual memory regions for each process, holding fine-grained 
locks on individual nodes as I traverse down this tree (instead of locking the 
root, for example, which prevents other threads from making progress).

Choosing the right flavor of synchronization object to use is key too. If a 
lock can only be held by 1 thread at a time, consider using a mutex over a 
semaphore, since the former tends to be more lightweight. If something is read 
many times, but only modified sometimes, consider using a reader-writer lock to 
allow parallelism between readers.  There are many other design decisions that 
a kernel developer must make!

### Pre-emptibility

Almost every modern OS uses pre-emptible scheduling, in which running threads 
are pre-empted to run another thread. Our Pebbles kernel forces a context switch 
on every timer interrupt, which we configure to fire every 2 milliseconds, i.e. 
we context switch 500 times per second. 

Now, what happens if a syscall is in the middle of a critical section that 
absolutely cannot be pre-empted?  For instance, suppose a syscall is in the middle 
of modifying some data structure, then a timer interrupt occurs, then the timer 
handler begins touching the same data structure.  To prevent this, a simple solution 
is to mask interrupts in the syscall before entering the critical section, then unmask 
interrupts upon leaving the critical section. 

However, overuse of masking interrupts is an anti-pattern, as pre-emptibility is 
important for a responsive kernel (moreover, masking interrupts would not work for 
a multicore machine).  Interrupt handlers must be able to respond prompty and quickly 
(for instance, Linux uses top-halves and bottom-halves to defer work via mechanisms 
like `softirq`, `tasklet`, `workqueue`), but ensuring this can be much harder than 
it seems. 

### Tricky Scenarios

When designing and implementing the Pebbles kernel, I ran into many tricky 
situations. One of the most common sources of headache is running out of kernel 
heap in the middle of a syscall.  This forces the syscall to either retry, or undo all 
of the actions it had taken so far.  But what happens if another error occurs 
during this undoing process? Should we `panic()` in this case, or return an error 
to userspace?  Thoughtful, case-by-case error handling is absolutely necessary 
for kernel developers. 

Another related source of headache is when we are unable to free a large amount of 
memory, due to a small amount of memory that must be allocated before the free can 
occur. For instance, a common implementation of hash dictionaries is to dynamically 
resize an array of linked lists. If we delete an element from this hash dictionary, 
we may have to allocate a new array of half size, move everything from the original 
array to the new array, then free the original array. But what happens if we run out 
of memory for the smaller array?  Uh-oh.

(I recently read a paper - which I wrote a summary for [here]() - about writing 
a POSIX kernel in Go.  One of the novelties the paper introduces is for each 
syscall to acquire all the heap memory it needs before entering.  I thought this was a 
very interesting approach which definitely removes many tricky scenarios that must 
be handled, but of course comes with its own drawbacks)


## 👨‍🏫 PebPeb Hypervisor

PebPeb Hypervisor is a para-virtualized hypervisor, written as an extension to 
the Pebbles kernel (similar to [KVM](https://linux-kvm.org/page/Main_Page) in Linux). 
Unlike full emulation, paravirtualization allows for high-performant virtualization 
(for instance, `virtio` is paravirtualized I/O).  PebPeb Hypervisor supports the 
following hypercalls:

- `hv_disable_interrupts()` - disable virtual interrupts for guest
- `hv_enable_interrupts()` - enable virtual interrupts for guest
- `hv_setidt()` - guest writes to Interrupt Descriptor Table (IDT)
- `hv_setpd()` - guest writes to CR3 (pointer to page directory)
- `hv_adjustpg()` - guest modifies paging structures
- `hv_iret()` - guest executes `IRET` instruction
- `hv_print()` - guest prints to virtual console
- `hv_cons_set_term_color()` - guest prints to virtual console
- `hv_cons_set_cursor_pos()` - set cursor position of virtual console
- `hv_cons_get_cursor_pos()` - get cursor position of virtual console
- `hv_print_at()` - guest prints to virtual console at specified position
- `hv_exit()` - guest exits

Due to a shortened semester, we only had to implement loading guest VMs, delivering virtual 
interrupts, and scheduling guest VMs. Delivering virtual interrupts was definitely the trickiest 
aspect, as the hypervisor must modify the guest VM's kernel stack and invoke the correct handler 
registered by the guest VM.

## ⭐ Summary

Overall, I wrote an entire software stack, consisting of a userspace thread library, 
running on top of my Pebbles kernel for x86, running on top of my PebPeb hypervisor, 
all from scratch using 20,000+ lines of C and 3,000+ lines of assembly.  This was one 
of the most challenging, yet rewarding projects I've worked on. 

Although I only wrote a basic hypervisor for this project, I ended up contributing 
to a modern hypervisor as part of my research at ShinaLab at The University of Tokyo. 
This hypervisor can run on the latest Intel and AMD CPUs, and supports Windows, Linux, 
and MacOS guests. I wrote code for shadowing [IOMMU](https://en.wikipedia.org/wiki/Input%E2%80%93output_memory_management_unit) paging structures and ring buffers - 
see my project page [here]() for more details. 

*Note: the thumbnail was generated by ChatGPT.*