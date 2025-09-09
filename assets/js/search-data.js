// get the ninja-keys element
const ninja = document.querySelector('ninja-keys');

// add the home and posts menu items
ninja.data = [{
    id: "nav-about",
    title: "about",
    section: "Navigation",
    handler: () => {
      window.location.href = "/";
    },
  },{id: "nav-blog",
          title: "blog",
          description: "",
          section: "Navigation",
          handler: () => {
            window.location.href = "/blog/";
          },
        },{id: "nav-courses",
          title: "courses",
          description: "Reviews for courses I took at Carnegie Mellon University.",
          section: "Navigation",
          handler: () => {
            window.location.href = "/courses/";
          },
        },{id: "nav-projects",
          title: "projects",
          description: "A collection of cool projects!",
          section: "Navigation",
          handler: () => {
            window.location.href = "/projects/";
          },
        },{id: "nav-teaching",
          title: "teaching",
          description: "Classes that I TA-ed for.",
          section: "Navigation",
          handler: () => {
            window.location.href = "/teaching/";
          },
        },{id: "nav-paper-summaries",
          title: "paper summaries",
          description: "Summaries of selected papers I read.",
          section: "Navigation",
          handler: () => {
            window.location.href = "/paper_summaries/";
          },
        },{id: "post-writing-a-hypervisor-from-scratch-software",
        
          title: "Writing a Hypervisor from Scratch - Software",
        
        description: "Taking a close look at FreeBSD&#39;s BHyVe.",
        section: "Posts",
        handler: () => {
          
            window.location.href = "/blog/2025/vtx-bhyve/";
          
        },
      },{id: "post-writing-a-hypervisor-from-scratch-hardware",
        
          title: "Writing a Hypervisor from Scratch - Hardware",
        
        description: "Taking a close look at hardware virtualization support.",
        section: "Posts",
        handler: () => {
          
            window.location.href = "/blog/2025/vtx-hardware/";
          
        },
      },{id: "books-the-godfather",
          title: 'The Godfather',
          description: "",
          section: "Books",handler: () => {
              window.location.href = "/books/the_godfather/";
            },},{id: "news-a-simple-inline-announcement",
          title: 'A simple inline announcement.',
          description: "",
          section: "News",},{id: "news-a-long-announcement-with-details",
          title: 'A long announcement with details',
          description: "",
          section: "News",handler: () => {
              window.location.href = "/news/announcement_2/";
            },},{id: "news-a-simple-inline-announcement-with-markdown-emoji-sparkles-smile",
          title: 'A simple inline announcement with Markdown emoji! :sparkles: :smile:',
          description: "",
          section: "News",},{id: "projects-x86-kernel-hypervisor",
          title: 'x86 Kernel + Hypervisor',
          description: "Pebbles Kernel and PebPeb Hypervisor.",
          section: "Projects",handler: () => {
              window.location.href = "/projects/1_project/";
            },},{id: "projects-risc-v-cpu",
          title: 'RISC-V CPU',
          description: "RISC-V CPU with 7-stage pipeline + data forwarding + branch prediction + L1 cache.",
          section: "Projects",handler: () => {
              window.location.href = "/projects/2_project/";
            },},{id: "projects-distributed-systems-projects",
          title: 'Distributed Systems Projects',
          description: "Distributed Bitcoin Miner + Raft Consensus Algorithm + Massively Multiplayer Online Game.",
          section: "Projects",handler: () => {
              window.location.href = "/projects/3_project/";
            },},{id: "projects-wehe",
          title: 'WeHe',
          description: "an iOS App for Detecting and Localizing Network Traffic Differentiation.",
          section: "Projects",handler: () => {
              window.location.href = "/projects/4_project/";
            },},{id: "projects-hypercopilot",
          title: 'HyperCopilot',
          description: "a thin, para-passthrough hypervisor + FPGA coprocessor for secure direct memory introspection",
          section: "Projects",handler: () => {
              window.location.href = "/projects/5_project/";
            },},{id: "projects-project-6",
          title: 'project 6',
          description: "a project with no image",
          section: "Projects",handler: () => {
              window.location.href = "/projects/6_project/";
            },},{id: "projects-project-7",
          title: 'project 7',
          description: "with background image",
          section: "Projects",handler: () => {
              window.location.href = "/projects/7_project/";
            },},{id: "projects-project-8",
          title: 'project 8',
          description: "an other project with a background image and giscus comments",
          section: "Projects",handler: () => {
              window.location.href = "/projects/8_project/";
            },},{id: "projects-project-9",
          title: 'project 9',
          description: "another project with an image 🎉",
          section: "Projects",handler: () => {
              window.location.href = "/projects/9_project/";
            },},{
        id: 'social-email',
        title: 'email',
        section: 'Socials',
        handler: () => {
          window.open("mailto:%73%68%63%68%69%65%6E@%61%6E%64%72%65%77.%63%6D%75.%65%64%75", "_blank");
        },
      },{
        id: 'social-github',
        title: 'GitHub',
        section: 'Socials',
        handler: () => {
          window.open("https://github.com/stephentea", "_blank");
        },
      },{
        id: 'social-linkedin',
        title: 'LinkedIn',
        section: 'Socials',
        handler: () => {
          window.open("https://www.linkedin.com/in/stephen-chien-a887a1252", "_blank");
        },
      },{
      id: 'light-theme',
      title: 'Change theme to light',
      description: 'Change the theme of the site to Light',
      section: 'Theme',
      handler: () => {
        setThemeSetting("light");
      },
    },
    {
      id: 'dark-theme',
      title: 'Change theme to dark',
      description: 'Change the theme of the site to Dark',
      section: 'Theme',
      handler: () => {
        setThemeSetting("dark");
      },
    },
    {
      id: 'system-theme',
      title: 'Use system default theme',
      description: 'Change the theme of the site to System Default',
      section: 'Theme',
      handler: () => {
        setThemeSetting("system");
      },
    },];
