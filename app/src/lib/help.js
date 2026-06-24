// Contextual help registry — keyed by route path.
// Each entry powers the right-side HelpSheet (accordion sections + shortcuts).
// Plain data so it's trivial to edit copy without touching components.

export const HELP = {
  "/inbox": {
    title: "Inbox",
    tagline: "Capture every idea, then triage it.",
    sections: [
      {
        heading: "What is the Inbox?",
        body: "The Inbox is where every captured idea lands first. Save a link or a quick note, then move it through your pipeline as you develop it.",
      },
      {
        heading: "Capture an idea",
        body: "Tap New (or press N) to paste a URL or jot a note. Shared links from Instagram, YouTube, TikTok and the web are imported automatically with a preview and AI summary.",
      },
      {
        heading: "Filter & search",
        body: "Use the status tabs to focus on a stage, the Filters menu for platform / date refinements, and the search box to find anything by title, note, URL or AI summary.",
      },
      {
        heading: "Work in bulk",
        body: "Turn on Select to tick multiple ideas, then change their status or delete them together. Deletes can be undone from the toast.",
      },
    ],
    shortcuts: [
      { keys: "N", label: "New idea" },
      { keys: "1–5", label: "Filter by status" },
      { keys: "Esc", label: "Cancel / close" },
    ],
  },
  "/board": {
    title: "Board",
    tagline: "Your content pipeline at a glance.",
    sections: [
      {
        heading: "How the board works",
        body: "Each column is a stage: Ideas → Planned → Creating → Published. Drag a card between columns to update its status instantly.",
      },
      {
        heading: "Open an idea",
        body: "Click any card to open its full detail view, where you can edit notes and generate AI briefs, hooks and scripts.",
      },
    ],
    shortcuts: [],
  },
  "/calendar": {
    title: "Calendar",
    tagline: "Plan when each idea goes live.",
    sections: [
      {
        heading: "Schedule content",
        body: "Drag an idea from the queue below onto a date to schedule it. Drag a scheduled item to another day to reschedule.",
      },
      {
        heading: "See a day's plan",
        body: "Tap a date to open the day panel with everything scheduled for it.",
      },
    ],
    shortcuts: [],
  },
  "/topics": {
    title: "Listening",
    tagline: "Let AI surface what your audience cares about.",
    sections: [
      {
        heading: "Create a topic",
        body: "Add a topic with keywords, your audience and the platforms you care about. ContentPlanner researches it on a schedule.",
      },
      {
        heading: "Research briefs",
        body: "Each run produces a brief with content angles and clusters of what's trending. Save any angle straight to your Inbox as a new idea.",
      },
      {
        heading: "Run on demand",
        body: "Use Search now for a quick refresh, or Deep run for a more thorough pass. Pause a topic anytime to stop scheduled runs.",
      },
    ],
    shortcuts: [],
  },
  "/settings": {
    title: "Settings",
    tagline: "Make ContentPlanner yours.",
    sections: [
      {
        heading: "Appearance",
        body: "Switch between light and dark mode. Your choice is remembered on this device.",
      },
      {
        heading: "Install the app",
        body: "Add ContentPlanner to your home screen for one-tap capture and a full-screen, app-like experience.",
      },
    ],
    shortcuts: [],
  },
  "/inbox/:id": {
    title: "Idea detail",
    tagline: "Develop a single idea end to end.",
    sections: [
      {
        heading: "Notes & status",
        body: "Edit your notes, change the idea's status, or schedule it for a date — all from this page.",
      },
      {
        heading: "AI assistance",
        body: "Generate a research brief, a set of hooks, or a full script. Copy any output to your clipboard with one tap.",
      },
    ],
    shortcuts: [],
  },
};

// Resolve a route to its help entry, handling the /inbox/:id detail route.
export function helpForPath(pathname) {
  if (HELP[pathname]) return HELP[pathname];
  if (/^\/inbox\/[^/]+$/.test(pathname)) return HELP["/inbox/:id"];
  return null;
}
