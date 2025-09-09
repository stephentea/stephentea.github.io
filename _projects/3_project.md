---
layout: page
title: Distributed Systems Projects
description: Distributed Bitcoin Miner + Raft Consensus Algorithm + Massively Multiplayer Online Game.
img: assets/img/distributed-projects.png
importance: 3
category: course
toc:
  sidebar: left
---

## 💭 About

As part of [15-440 Distributed Systems](../../courses/#15-440-distributed-systems) at CMU, 
I worked on various projects in Distributed Systems, using [Go](https://go.dev/), a popular 
language for systems programming (although the most trendy may be Rust right now). Go has an 
easy-to-use concurrency model, including standard primitives like [mutexes](https://go.dev/tour/concurrency/9) 
and [condition variables](https://pkg.go.dev/sync#Cond), but also higher-level primitives like [goroutines](https://go.dev/tour/concurrency/1), and buffered and unbuffered [channels](https://go.dev/tour/concurrency/2).

This page highlights the technical details, challenges faced, and my personal 
thoughts about the four projects in 15-440: Distributed Key-Value Store, Distributed 
Bitcoin Miner, Raft Consensus Algorithm, and Massively-Multiplayer Online (MMO) Game. 

## 🔑 Distributed Key-Value Store

As a warm-up to Go, I implemented a distributed key-value store, which forms 
the basis of modern distributed applications. For instance, [Atomix](https://atomix.io/) 
is a distributed key-value store that [Open Network Operating System (ONOS)](https://opennetworking.org/onos/), a highly scalable and available [SDN](https://www.vmware.com/topics/software-defined-networking) controller, runs on top of.

This project mainly consists of spinning up goroutines to accept new connections 
from clients (using Go's TCP package), then having a pool of worker goroutines 
that continuously handle requests, including `PUT`, `GET`, `DELETE`, and `UPDATE`.

## 🪙 Distributed Bitcoin Miner

This project consists of 2 parts. In the first part, I implemented a TCP-like protocol 
(called Live Sequence Protocol LSP) on top of Go's UDP package. LSP supports in-order, 
reliable byte stream semantics, using sliding window for flow control, retransmission 
after timeout, and SHA-1 checksums for message integrity. Debugging involved spinning 
up multiple servers and opening connections between them, then observing logs at both 
end hosts and via capturing packets in-network. 

In the second part, I implemented a distributed bitcoin miner, consisting of 
a central coordinator node, with multiple worker nodes, all communicating using 
my own LSP network protocol explained above. The main challenge was the coordinator 
node, as I had to keep track of the load on each worker node, use [shortest-remaining job first scheduling](https://www.geeksforgeeks.org/operating-systems/shortest-job-first-or-sjf-cpu-scheduling/) to minimize latency, and use load balancing to evenly distribute requests among worker nodes.

## 🛶 Raft Consensus Algorithm

[Raft](https://raft.github.io/) is a consensus algorithm for synchronizing 
state across multiple nodes, even in the case of failures or network partitions. 
Although the full algorithm is complicated, the essential idea is this: leaders 
are elected from candidates, who then broadcast updates to followers periodically, 
allowing them to replicate the same state locally. 

Personally, this was the most challenging project, as it was complex to reason about 
and debug the evolution of the states across multiple nodes. One especially challenging 
scenario is when a network partition occurs, then is resolved - in this case, two leaders 
must reconcile conflicting states, as there can be only one leader at the end. In addition, 
Raft makes frequent use of retries after random intervals to prevent livelocks (for example, 
to prevent two candidates from repeatedly nominating themselves), which makes it hard to 
consistently reproduce bugs.

## 🎮 Massively-Multiplayer Online (MMO) Game

The last project is a massively-multiplayer online (MMO) game, consisting of 
a stateless client front-end, with a distributed key-value store (similar to the 
one implemented in the first project) as the backend. I used the [Actor Model](https://en.wikipedia.org/wiki/Actor_model) to communicate between different services running on the same node as well as across 
different nodes, and used RPC as the over-the-wire protocol.

<div class="row">
    <div class="col-sm mt-3 mt-md-0">
        {% include figure.liquid loading="eager" path="assets/img/distributed-project-cmud.png" title="cmud" class="img-fluid rounded z-depth-1" %}
    </div>
</div>
<div class="caption">
    Architecture of this project (borrowed from project handout).
</div>


One of the main challenges of this project is guaranteeing [eventual consistency](https://en.wikipedia.org/wiki/Eventual_consistency) for the distributed key-value store. This is to ensure all 
clients eventually observe the same world-state of the game. I used a [gossip-based protocol](https://en.wikipedia.org/wiki/Gossip_protocol) for nodes to share their current state with other nodes after 
random intervals, and used to leader election to select a node within each cluster of nodes to be 
responsible for propagating updates in the state to the rest of the cluster. 