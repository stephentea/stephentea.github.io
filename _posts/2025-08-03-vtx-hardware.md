---
layout: post
title: Writing a Hypervisor from Scratch - Hardware
date: 2025-08-03
description: Taking a close look at hardware virtualization support.
tags: virtualization operating-systems
categories: systems
toc:
  sidebar: left
---


Virtualization is one of the most important technologies behind modern cloud computing. 
With increasing hardware support for virtualization provided by CPU vendors such as Intel 
and AMD over the past 20 years, high performant virtualization is now possible. This article 
will explain hardware virtualization support from the perspective of someone writing a hypervisor 
from scratch.

Main reference is [ハイパーバイザの作り方](https://syuu1228.github.io/howto_implement_hypervisor/), a Japanese blog series on hypervisor development, but I will 
supplement these notes with my own experience working on [BitVisor](https://github.com/matsu/bitvisor), 
a lightweight, para-passthrough hypervisor supporting MacOS, Windows, and Linux, running on top of 
both Intel and AMD CPUs. Read [Intel's Software Development Manual](https://www.intel.com/content/www/us/en/developer/articles/technical/intel-sdm.html) for an official reference!

# What is Virtualization?

Virtualization refers to the emulation of computing resources, to allow running 
multiple isolated environments on a single physical machine. For instance, by using 
a hypervisor, we can run multiple virtual machines (VMs) on top, each consisting of 
an operating system along with userspace applications. Another example is network 
virtualization, which allows running multiple isolated networks on top of a physical network. 

<div class="row">
    <div class="col-sm mt-3 mt-md-0">
        {% include figure.liquid loading="eager" path="vtx-hardware-imgs/vtx-hardware-stack.png" title="cmud" class="img-fluid rounded z-depth-1" %}
    </div>
</div>
<div class="caption">
    Non-virtualized computing stack (left), virtualized computing stack, specifically Type 1 VMM (right).
</div>

This article will focus on the former, i.e. computing virtualization (for network 
virtualization, refer to my other blog post on Software Defined Networking [here]()). 
Within this, we will focus specifically on Intel VT (Vanderpool Technology), although similar technologies exist for AMD, Arm, and other CPU vendors, hence concepts covered in this article are easily 
translatable. 

# Intel VT-x

A non-virtualized software stack involves running an OS in kernel-space and applications 
in user-space. With traditional virtualization, we run the hypervisor (also called VMM) in 
kernel-space, and run multiple OS + applications in user-space. When the guest OS executes 
a sensitive instruction in user-space, for example, setting CR3 or performing device I/O 
with `INB` and `OUTB`, we expect the CPU to **trap** these instructions, transferring control 
to the hypervisor, which allows the hypervisor to emulate these instructions.  

Historically, x86 has been hard to virtualize, as many sensitive instructions 
such as `POPF` do not trap when executed in userspace.  [VMWare's](https://www.vmware.com/) 
solution to this was to use binary translation, i.e. statically analyze guest OS binary 
to replace sensitive instructions with instructions that trap.  This requires no modifications 
to the guest OS source. On the other hand, [Xen's](https://xenproject.org/) solution was to 
use **paravirtualization**, i.e. modifying guest OS source code to user **hypercalls** that 
rely on the existence of a hypervisor. This requires modifications to the guest OS source, 
but can achieve higher performance than full emulation. 

In 2003, Intel introduced VT-x, which is a set of extensions to their CPUs to better 
support virtualization. In addition to the 4 rings of protection (kernel-mode at ring 0 
and user-mode at ring 3), VT-x introduces **root mode** and **non-root mode**. We run 
hypervisors in the former, and guest VMs in the latter. Transitioning from root mode to 
non-root mode is called VMENTRY, while transitioning from non-root mode to root mode 
is called VMEXIT. 

<div class="row">
    <div class="col-sm mt-3 mt-md-0 text-center">
        {% include figure.liquid loading="eager" path="vtx-hardware-imgs/vtx-hardware-rootnonroot.png" title="root-non-root" class="img-fluid rounded z-depth-1" width="400" height="300"%}
    </div>
</div>
<div class="caption">
    Root mode (hypervisor) on left, non-root mode (guest VM) on right. Transition 
    from root mode to non-root mode is called VMENTRY, transition from non-root mode 
    to root mode is called VMEXIT.
</div>

Let's first take a look at the lifecycle of a VM. First, the hypervisor must enable 
VT-x by setting the VMXE bit in CR4 to 1 (must be done in ring 0). Next, the hypervisor 
must allocate a **Virtual Machine Control Structure (VMCS)** (page-aligned in memory) to 
specify what will trigger VMEXIT from non-root mode to root mode (we will discuss VMCS 
in more detail in the next section). Note that VMCS is an opaque data structure to hypervisors, 
hence we must read and write to VMCS using dedicated instructions.

After initializing a VMCS for each vCPU (virtual CPU) of the guest VM, the hypervisor 
will use `VMPTRLD` to point each vCPU to the corresponding VMCS in memory, then use 
`VMCLEAR` to flush VMCS from cache to memory.  Before launching the guest VM, we must 
save hypervisor state by writing certain registers to the VMCS (these will be restored 
by the CPU on the next VMEXIT) and other registers using `PUSHA`, `PUSHF`. 

After saving hypervisor state, we will restore guest state by restoring registers 
using `POPA`, `POPF`.  Finally, we can enter non-root mode using `VMLAUNCH` (if first 
time entering guest VM) or `VMRESUME` (for all later times). Certain guest state saved 
in the VMCS will be restored by the CPU automatically. Now, the guest VM wil run until 
VMEXIT occurs (for example, guest OS executes a sensitive instruction or an external 
interrupt arrives). 

When VMEXIT occurs, the CPU will write the reason for exit in the VMCS, automatically 
save certain guest registers, restore certain host registers, and switch to root mode. 
The hypervisor must save other guest registers not saved by the CPU (for instance, by 
using `MOV`) and restore other host registers not done by the CPU (for instance, using 
`POPA`, `POPF`). 

Now, the hypervisor will investigate the reason for VMEXIT and perform the proper 
emulation, for example, emulating device I/O or returning system state information 
to the guest. Before resuming the guest with `VMRESUME`, the hypervisor must issue 
`VMCLEAR` to flush VMCS from cache to memory (since another vCPU may run next). This 
cycle continues for the lifetime of the guest VM. 

<div class="row">
    <div class="col-sm mt-3 mt-md-0 text-center">
        {% include figure.liquid loading="eager" path="vtx-hardware-imgs/vtx-hardware-lifecycle.png" title="root-non-root" class="img-fluid rounded z-depth-1" width="400" height="300"%}
    </div>
</div>
<div class="caption">
    Lifecycle of a VM. Hypervisor launches a guest VM by configuring VMCS, then 
    uses VMLAUNCH. Guest VM transfers control back to hypervisor upon VMEXIT. 
    Hypervisor performs emulation, then starts guest VM using VMRESUME.
</div>

# Virtual Machine Control Structure (VMCS)

VMCS is an in-memory structure used to configure guest VMs. Hypervisors must read 
`VMREAD`, `VMWRITE` to read/write from VMCS. To initialize a VMCS, hypervisors must 
use `VMPTRLD` to point the vCPU to the VCMS, use `VMCLEAR` to clear all fields, and 
use `VMWRITE` to set the fields. VT-x also provides `VMCALL` and `VMFUNC` to allow 
guest VMs to make hypercalls for paravirtualization. VMCS contains the following 
fields:

<div class="row">
    <div class="col-sm mt-3 mt-md-0 text-center">
        {% include figure.liquid loading="eager" path="vtx-hardware-imgs/vtx-hardware-vmcs.png" title="vmcs" class="img-fluid rounded z-depth-1" width="400" height="300"%}
    </div>
</div>
<div class="caption">
    Fields within Virtual Machine Control Structure (VMCS).
</div>

- **VMCS Revision Identifier** - Contains the revision number of the VMCS. As VT-x 
has been changed over the years, this allows different CPUs to properly read the VMCS 
when migrating a VMCS from one physical machine to another. 

- **VMCS Abort Indicator** - If an error occurs during VMEXIT, the CPU writes down 
error information in this field. If VMEXIT occurs successfully, this field will not 
be used. 

- **Guest State Area** - The CPU automatically saves and restores guest information here. 
Registers include: CR0, CR3, CR4, DR7, RSP, RIP, RFLAGS, CS, SS, DS, ES, FS, GS, LDTR, TR, 
GDTR, SMBASE, plus MSR registers including: IA32_DEBUGCTL, IA32_SYSENTER_CS, IA32_SYSENTER_ESP, IA32_SYSENTER_EIP, IA32_PERF_GLOBAL_CTRL, IA32_PAT, and IA32_EFER. 

<ul>
In addition, the CPU saves the state of each vCPU, information about each segment, pending/ 
blocked interrupts, VMX pre-emption timer counter, EPT PTE address, and more. The hypervisor 
must save and restore other information not included here (for instance, general purpose 
registers such as RAX, RBX, RCX).
</ul>

- **Host State Area** - The CPU automatically saves and restores host information here. 
Registers include: CR0, CR3, CR4, RSP, RIP, CS, SS, DS, ES, FS, GS, LDTR, TR, GDTR, plus 
MSR registers including: IA32_SYSENTER_CS, IA32_SYSENTER_ESP, IA32_SYSENTER_EIP, IA32_PERF_GLOBAL_CTRL, IA32_PAT, and IA32_EFER.  The hypervisor must save and restore other information not 
included here (for instance, general purpose registers such as RAX, RBX, RCX).

- **VM Execution Control Fields** - This field configures CPU behavior when executing 
guest VMs, including a bitmap of on/off flags for whether to VMEXIT on various reasons, 
on/off flag for EPT (we will cover this in the next section), EPT address, settings for 
virtual local APIC (we will cover this in [Interrupt Virtualization](#interrupt-virtualization)), 
VPID, etc. 

- **VM Exit Control Fields** - This field configures CPU behavior during VMEXIT, for 
instance, whether to save/restore MSR, on/off flag for hypervisor 64-bit mode, etc. 

- **VM Entry Control Fields** - This field configures CPU behavior during VMENTRY, for 
instance, configuring delivery of virtual interrupts, whether to save/restore MSR, on/off 
flag for guest 64-bit mode, etc. 

- **VM Exit Information Fields** - When a VMEXIT occurs, the CPU writes exit information here. 
Reasons include: exception, NMI, external interrupt, internal interrupt, triple fault, INIT signal, 
SIPI signal, SMI signal, task switch, `CPUID` instruction, SMX-related instructions, `HLT` instruction, 
cache-related instructions (`INVD`, `WBINVD`), TLB-related instructions (`HNVLPG`, `INVPCID`), I/O-related 
instructions (`INB`, `OUTB`), performance monitoring counter-related instructions (`RDPMC`), timestamp 
counter-related instructions (`RDTSC`), SMM-related instructions, `MONITOR`/`MWAIT` instructions, `PAUSE` 
instruction, `RDRAND` instruction, VT-x instructions, access to control registers / debug registers / MSR / 
APIC / GDTR / IDTR / LDTR / TR, and expiry of VMX pre-emption timer. 

# Memory Virtualization

**Virtual memory** provides each process with an isolated, uniform address space. 
OS configures page tables (2-level for 32-bit, 4-level for 64-bit), which the MMU 
hardware uses to map virtual address issued by the CPU to the corresponding physical 
address.  In addition, page tables provide access information, such as read (R) / write (W) / 
execute (X) permissions, and accessed (A) and dirty (D) flags to allow the OS to make decisions 
about paging in and out of disk. 

<div class="row">
    <div class="col-sm mt-3 mt-md-0 text-center">
        {% include figure.liquid loading="eager" path="vtx-hardware-imgs/vtx-hardware-virtual-memory.png" title="virtual-memory" class="img-fluid rounded z-depth-1"%}
    </div>
</div>
<div class="caption">
    Paging structures for translating virtual address (VA) to physical address (PA). 
</div>


When running guest OSes on top of a hypervisor, we must virtualize virtual memory, since 
guest OSes configure page tables to map from guest virtual addresses (GVA) to guest physical 
addresses (GPA), which are likely different from the underlying host physical addresses (HPA). 
There are two main techniques for doing this: shadowing paging and EPT. 

**Shadow paging** is a virtualization technique done exclusively in software. 
Whenever the guest modifies CR3 or changes a page table entry, the hypervisor 
creates a copy of paging structures (called shadow paging structures) by walking 
guest structures, translating every GPA to the corresponding HPA, then sets CR3 
to point to the shadow PML4 table. 

<div class="row">
    <div class="col-sm mt-3 mt-md-0 text-center">
        {% include figure.liquid loading="eager" path="vtx-hardware-imgs/vtx-hardware-shadow-paging.png" title="shadow-paging" class="img-fluid rounded z-depth-1"%}
    </div>
</div>
<div class="caption">
    The paging structures configured by the guest VM (lower) maps GVA to GPA, but 
    GPA does not necessariy direct-map to HPA. Therefore, shadow paging structures 
    configured by the hypervisor (upper) are used to correctly map GVA to HPA. 
</div>

**Extended Page Table (EPT)** refers to hardware support by CPUs in which the 
hypervisor creates a 4-level page table that translates from GPA to HPA. By enabling 
EPT and setting the Extended Page Table Pointer (EPTP) to point to the PML4 table, the 
hardware will perform nested translation for every GVA. That is, instead of accessing 
the GPA of the PML4 table pointed to by CR3, hardware will translate the GPA of the PML4 
table into HPA, then access this table, and so on. Using EPT removes the overhead of VMEXIT 
on every write to CR3 or changes to page table entries found in shadow paging (hypervisors 
usually write-protect guest paging structures in this case).

<div class="row">
    <div class="col-sm mt-3 mt-md-0 text-center">
        {% include figure.liquid loading="eager" path="vtx-hardware-imgs/vtx-hardware-ept.png" title="ept" class="img-fluid rounded z-depth-1"%}
    </div>
</div>
<div class="caption">
    The hypervisor configures the EPT (extended page table) to map from GPA to HPA, 
    which the MMU uses to translate every GPA it encounters while walking guest paging structures.
</div>

Additionally, VT-x introduces **Virtual Process Identifier (VPID)** which can be 
configured in the VMCS for each guest VM to tag the TLB. Previously, software had to 
flush the entire TLB on every VMEXIT / VMENTRY to prevent wrong translations from 
being used from one guest VM to another. Using VPID allows hardware to differentiate 
between translation entries from different guest VMs, which prevents the need to flush 
the entire TLB, hence improving performance. This is similar to PASID used in IOTLBs. 

# I/O Virtualization

One of the main role of an OS is to abstract access to devices using common 
interfaces, for instance, Unix files or Berkeley web sockets. **Device drivers** 
within OSes are responsible for interaction with hardware, for instance, writing to 
configuration registers to perform initial setup, reading/ writing to data and control 
registers, and setting up DMA for large transfers of data. Device drivers perform I/O in two ways: 
**I/O mapped I/O** (also called port-mapped I/O) and **memory-mapped I/O (MMIO)**.  

For I/O mapped I/O, software reads/ writes from an I/O address space, independent 
of the existing address space for main memory. For instance, we can use `INB` and `OUTB` 
to read/ write from specified ports. The hypervisor can configure all accesses to I/O 
ports to VMEXIT by setting Unconditional I/O Exiting to 1 in VM Execution Control Fields, 
or set Use I/O Bitmaps to 1 and set the bits corresponding to the I/O addresses we wish 
to VMEXIT on.

<div class="row">
    <div class="col-sm mt-3 mt-md-0 text-center">
        {% include figure.liquid loading="eager" path="vtx-hardware-imgs/vtx-hardware-io-mapped-io.png" title="io-mapped-io" class="img-fluid rounded z-depth-1" width="400" height="300"%}
    </div>
</div>
<div class="caption">
    VMCS contains pointers to I/O Bitmap A and I/O Bitmap B. The former 
    corresponds to 0x0000 ~ 0x7FFFF of the I/O address space, while the 
    latter corresponds to 0x8000 ~ 0xFFFF.
</div>


To emulate I/O behavior, we must know the access direction (read or write), the 
access size (number of bytes), and the port number. These information is found in 
the VM Exit Information Fields in the VMCS. In addition, for I/O mapped I/O, non-string 
accesses must use the RAX register, while string accesses must use the memory region 
pointed to by ES:ESI. This allows the hypervisor to fully emulate I/O behavior. 

For instance, if the guest attempts to read a non-string from port 80, the hypervisor 
can return return fake information by writing to RAX.  Similarly, if the guest attempts 
to write a string to port 80, the hypervisor can read the string from address specified 
by ES:ESI, then perform the corresponding write (either to an emulated device or physical 
device).

For memory-mapped I/O, the hypervisor can set the corresponding page table entries 
to not-present (P = 0) for shadow paging, or set both the read and write access bits 
to 0 for EPT. This will cause either a PF-exception or EPT-violation when the guest 
performs MMIO, transferring control to the hypervisor. However, VT-x does not provide 
further information about the access direction, access size, or the source/destination 
of data. 

Therefore, the hypervisor must perform instruction emulation. Specifically, the 
hypervisor will first obtain the RIP from the VMCS, read the instruction that caused 
the VMEXIT from guest memory, decode this instruction to obtain the necessary information, 
then use this to perform device emulation. This is a extra overhead compared to I/O mapped 
I/O, hence VT-x provides optimized alternatives for commonly accessed hardware registers 
such as APIC and TPR (more on this in the next section). 

# Interrupt Virtualization

Interrupts are used for asynchronous coordination between CPU and external devices. 
There are 2 types of interrupts: **external** and **internal**. 

- Within external interrupts, there are **maskable** and **non-maskable interrupts (NMI)**.  
The former are used by standard devices, such as keystrokes and timer interrupts. 
The latter are usually used for non-recoverable hardware errors. External interrupts 
are asynchronous to the instruction stream.

- Within internal interrupts, there are **exceptions** and **software interrupts**. 
The formers are used to notify the OS of errors during execution (for example, page 
faults, divide by 0, etc). The latter are used for userspace applications to trap into 
the kernel, for instance using `INT` for system calls in x86-32. Internal interrupts 
are synchronous to the instruction stream (hence cannot be masked).

Traditionally, CPUs were connected to a PIC (Programmable Interrupt Controller) - sometimes 
daisy-chained - that directs interrupts from hardware devices to the CPU. Modern architectures 
use **APICs** (Advanced Programmable Interrupt Controller). 

<div class="row">
    <div class="col-sm mt-3 mt-md-0 text-center">
        {% include figure.liquid loading="eager" path="vtx-hardware-imgs/vtx-hardware-interrupts.png" title="io-mapped-io" class="img-fluid rounded z-depth-1"%}
    </div>
</div>
<div class="caption">
    Architecture of interrupt delivery in modern systems. Each CPU has a local APIC, 
    which can use IPIs to deliver interrupts to other CPUs. I/O APIC is connected to 
    legacy PCI devices, with newer PCIe devices using MSI/MSI-X.
</div>



## Understanding Interrupt Hardware 

Each CPU has a **local APIC**, which is responsible for allocating vector numbers to interrupts, delivering interrupts to the CPU by invoking the correct handler in the **IDT** (Interrupt Descriptor Table), and receiving EOI (End of Interrupt) from CPUs. In addition, local APIC has extra features such as timers, 
temperature sensors, performance monitoring counters, and delivering/ receiving **IPIs** (inter-processor 
interrupts, used for TLB shootdown, for example).

Local APIC contains the following registers:

- **Interrupt Request Register (IRR)** - Bitmap of interrupts that have not been 
delivered to the CPU yet (read-only). 

- **In-Service Register (ISR)** - Contains the interrupt to be delivered next. 
After the CPU writes to EOI, the local APIC copies the highest priority interrupt 
from the IRR to the ISR (if pending interrupts exist), then delivers the interrupt 
in ISR by looking up the IDT and invoking the corresponding handler.

- **End of Interrupt (EOI)** - Used by CPU to notify local APIC that it is done 
handling the interrupt (write-only). Local APIC will then clear the ISR, and if 
IRR is non-zero, it will deliver the next highest-priority interrupt. 

- **Processor Priority Register (PPR)** - Used by local APIC to decide whether to 
mask interrupts or not. Bits [7:4] is the priority class, while bits [3:0] is the 
priority sub-class (only the upper bits are used for interrupt masking). If the PPR 
has a higher priority class than the highest priortiy interrupt in IRR, the interrupt 
will be masked - otherwise, it will be delivered. 

- **Task Priority Register (TPR)** - Used by local APIC to update PPR. Similar to 
PPR, TPR consists of priority class (bits [7:4]) and priority sub-class (bits [3:0]). 
If TPR[7:4] is greater or equal to PPR[7:4], PPR will be set to TPR. Otherwise, PPR[7:4] 
will be set to ISR[7:4] and PPR[3:0] will be cleared to 0. 

- **Local APIC ID Register (LAPIC)** - Used to identify local APIC in the system. 
For instance, I/O APIC uses LAPIC to redirect external interrupts to specific local 
APIC(s). IPI uses LAPIC to specify which CPU to deliver interrupts to and identify 
which CPU interrupts come from. 

- **Interrupt Command Register (ICR)** - Used to deliver IPIs. 

- **Logical Destination Register (LDR)** - Used to specify which LAPIC to deliver IPI to. 

- **Destination Format Register (DFR)** - Local APICs can be organized in different ways, 
for instance, flat model (using flat addressing) or cluster model (using hierarchical 
addressing). This register specifies which organizational model to use. 

I/O APIC is connected to up to 24 external devices and is responsible for routing 
external interrupts to local APIC(s) using the **Redirection Table**. A redirection 
table entry consists of Destination Mode, Delivery Mode, Destination, and Vector fields. 
Vector field specifies the external interrupt to redirect. 

If Destination Mode is Physical, Destination specifies the LAPIC to deliver interrupts to. 
If Destination Mode is Logical, Destination is a bitmask of which LAPICs to deliver interrupts to (for instance, `0000_0011b` delivers interrupts to both `0000_0001b` and `0000_0010b`).

If Destination Mode is Logical, we can further specify Delivery Mode. If Delivery Mode 
is Fixed, the I/O APIC will delivery interrupts to every LAPIC specified in Destination. 
If Delivery Mode is Lowest Priority, the I/O APIC will deliver the interrupt to the LAPIC 
with lowest TPR. If there are multiple local APICs with the same TPR, interrupts will be 
delivered in a round-robin manner. 

In the original specification, the Destination field was only 8-bits, i.e. the 
I/O APIC can only support up to 8 CPUs. From Nehalem onwards, Intel has introduced 
x2APIC (2nd-generation APIC) which expands the Destination field to 32-bits, i.e. 
the I/O APIC can now support up to 32 CPUs. 

Using I/O APIC alone has two problems: (1) there are only 24 external pins, hence 
multiple hardware devices may be forced to share the same pin, and (2) one hardware 
device can only deliver one type of interrupt. To fix this, **MSI** (Message Signalled 
Interrupt) and **MSI-X** (Extended Message Signalled Interrupt) are used. MSI delivers 
interrupts directly to local APICs via PCIe, instead of going through the I/O APIC. 

MSI supports up to 32 different vector numbers for a single device, while MSI-X 
extends this to 2048. To configure where interrupts are delivered, the OS writes to 
the PCIe device configuration registers using entries similar to the redirection 
table for I/O APIC. 

## Virtualizing Interrupt Hardware 

Hypervisors usually do not virtualize internal interrupts or IDT. Internal 
interrupts occur within non-root mode and are handled directly by looking up 
the IDT (which is guest-configured), without causing VMEXIT. Alternatively, 
hypervisors can configure the VMCS to cause a VMEXIT on internal interrupts, 
for instance for debugging purposes (counting the number of internal interrupts 
that occur in guest mode).

On ther other hand, hypervisors usually configure the VMCS to cause a VMEXIT 
upon receiving an external interrupt. The hypervisor must then deliver to the 
correct vCPU by reading the redirection table in the emulated I/O APIC, updating 
the registers in the emulated local APIC, and configuring delivery of virtual 
interrupts in the VMCS, then performing a VMENTER (the CPU will automatically 
deliver virtual interrupts according to information in VMCS).

The hypervisor must emulate the local APIC to ensure the guest OS sees a consistent 
state between receiving interrupts and local APIC registers (that is, delivering virtual 
interrupts alone is not enough).  However, guest OSes access local APIC registers via 
MMIO, which has an additional overhead of instruction emulation, as discussed in [I/O Virtualization](#io-virtualization).  

As accesses to local APIC registers are time-critical, VT-x allows hypervisors to set 
Virtualize APIC Accesses flag to 1 and set the corresponding APIC Access Page address in the VMCS. 
Then, when VMEXIT occurs due to MMIO access to local APIC registers, access information 
will be provided in Exit Information fields, without having to perform instruction emulation. 
Similarly, VT-x allows hypervisors to set TPR Shadow flag to 1 in VMCS to allow efficient 
TPR shadowing (i.e. VMEXIT iff TPR value is set below a threshold).

To emulate delivery of virtual interrupts, the hypervisor must take the following steps:

1. Set the corresponding bit in IRR. 
2. Wait until the vCPU VMEXIT (this will happen for external interrupts, but may not 
happen immediately for interrupts from emulated devices) or force VMEXIT using IPI.
3. Clear the highest-priority bit in the and copy this to ISR.
4. Update PPR using TSR and ISR. 
5. Configure VM Entry Information Field to deliver virtual interrupt. 
6. Execute VMRESUME.

To emulate receipt of EOI from vCPUs, the hypervisor must take the following steps:

1. If IRR is 0, execute VMRESUME. Otherwise, clear the highest priority bit in IRR 
and copy this to ISR.
2. Update PPR using TSR and ISR. 
3. Configure VM Entry Information Field to deliver virtual interrupt. 
4. Execute VMRESUME.

The hypervisor must emulate the I/O APIC as well. As I/O APIC are only accessed 
by guests upon startup, VT-x does not provide optimized shadowing features (unlike 
local APIC). The hypervisor will keep a redirection table mapping from interrupt 
vector numbers to vCPUs.

The hypervisor emulates MSI/MSI-X in a similar way to I/O APIC. The hypervisor will 
trap MMIO accesses to the configuration registers of PCIe device, and maintain a table 
(similar to the redirection table for I/O APIC) to map interrupt vector numbers to vCPUs.

# Summary

With this, we have covered enough of modern hardware virtualization support technologies 
to start diving into implementing a hypervisor using software. In the [next post]() 
in this blog series, I will explain the details and dive into the code behind [BHyVe](https://bhyve.org/), 
an open-source hypervisor for FreeBSD (similar to KVM/QEMU for Linux). For those wanting to 
learn more about passthrough virtualization and Intel VT-d, read my blog post [here]() (I have 
research experience in specifically this area)!

# References

[1] [https://syuu1228.github.io/howto_implement_hypervisor/](https://syuu1228.github.io/howto_implement_hypervisor/)                                                             
[2] [https://www.intel.com/content/www/us/en/developer/articles/technical/intel-sdm.html](https://www.intel.com/content/www/us/en/developer/articles/technical/intel-sdm.html)
