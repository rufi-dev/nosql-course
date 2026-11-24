// Single source of truth for course structure. Pages read from here; the store
// only records what the learner has done.

export const COURSE = {
  title: 'NoSQL, NewSQL and Distributed Architectures',
  short: 'NoSQL & Distributed Architectures',
  platform: 'Open Course',
  outcome: 'Explain the model, build a working example in a browser, and defend trade-offs.',
  runningCase:
    'Create a product inventory in a MongoDB playground: insert three documents, query low stock, update one record; map a shard key and explain replica lag and CAP trade-offs.',
  audience: 'Second- and third-year computing and engineering students, and developers who know SQL and want to reason about distributed data.',
  prerequisites: 'Basic SQL (SELECT, UPDATE, transactions), reading JSON, and comfort typing commands into a console.',
  format: {
    language: 'English',
    pace: 'Self-paced, eight weekly modules',
    weekly: 'About 4 hours a week',
    session: 'One 90-minute class session per module, plus labs',
    tools: 'Browser only. Nothing to install.',
  },
  passMark: 60,
  quizPass: 70,
  weights: { labs: 40, quiz: 30, assignment: 20, peer: 10 },
  externalTools: [
    { name: 'DB AI MongoDB Playground', url: 'https://play.db-ai.dev/', note: 'Real MongoDB shell in the browser' },
    { name: 'DB Fiddle', url: 'https://dbfiddle.uk/', note: 'Run the SQL transaction comparison' },
  ],
}

// Measurable course outcomes, each mapped to how it is assessed
// (How to Develop an Interactive Lesson, step 2).
export const OUTCOMES = [
  {
    id: 'o1',
    verb: 'Compare',
    text: 'Compare key-value, document and column-family models and choose one for a stated workload.',
    assessed: 'Quiz questions with explanations',
    evidence: ['reading', 'quiz'],
  },
  {
    id: 'o2',
    verb: 'Build',
    text: 'Create, query and update a document collection in a browser shell, and read an explain plan.',
    assessed: 'Lab 1 checkpoints',
    evidence: ['lab-shell'],
  },
  {
    id: 'o3',
    verb: 'Design',
    text: 'Choose a shard key using cardinality, frequency, monotonicity and query isolation, and justify it.',
    assessed: 'Lab 2 and the assignment',
    evidence: ['lab-shard', 'assignment'],
  },
  {
    id: 'o4',
    verb: 'Predict',
    text: 'Predict replica lag, stale reads and failover behaviour when the network partitions.',
    assessed: 'Labs 3 and 4, quiz',
    evidence: ['lab-replicas', 'lab-quorum', 'quiz'],
  },
  {
    id: 'o5',
    verb: 'Evaluate',
    text: 'Weigh two-phase commit cost against eventual consistency and NewSQL for a real case.',
    assessed: 'Lab 5 and the module discussion',
    evidence: ['lab-tx', 'discussion'],
  },
  {
    id: 'o6',
    verb: 'Defend',
    text: 'Deliver schema, query, result and a trade-off justification, and assess peers against a rubric.',
    assessed: 'Assignment and peer review',
    evidence: ['assignment', 'workshop'],
  },
]

export const MODULES = [
  {
    n: 1,
    title: 'The NoSQL landscape: one inventory, many machines',
    short: 'The NoSQL landscape',
    practical: 'Five browser labs, quiz, assignment and peer review',
    status: 'live',
    topics: ['Key-value, document, column-family', 'Workload-driven modelling', 'Sharding and replication', 'CAP, eventual consistency, 2PC, NewSQL'],
  },
  {
    n: 2,
    title: 'Document modelling: embed or reference',
    short: 'Document modelling',
    practical: 'Lab: reshape an order history three ways',
    status: 'planned',
    topics: ['Embedding vs referencing', 'Schema validation', 'Aggregation pipeline basics'],
  },
  {
    n: 3,
    title: 'Key-value and wide-column stores',
    short: 'Key-value and wide-column',
    practical: 'Lab: time-series rows in a column family',
    status: 'planned',
    topics: ['Redis data structures', 'Cassandra partition and clustering keys', 'Designing tables per query'],
  },
  {
    n: 4,
    title: 'Partitioning in depth',
    short: 'Partitioning',
    practical: 'Lab: resharding a hot collection',
    status: 'planned',
    topics: ['Range vs hash partitioning', 'Chunk splits and balancing', 'Consistent hashing'],
  },
  {
    n: 5,
    title: 'Replication and consistency models',
    short: 'Replication',
    practical: 'Lab: read-your-writes under failover',
    status: 'planned',
    topics: ['Leader-based vs leaderless', 'Session guarantees', 'Hinted handoff and read repair'],
  },
  {
    n: 6,
    title: 'Failure, CAP and PACELC',
    short: 'Failure and CAP',
    practical: 'Case discussion: an outage post-mortem',
    status: 'planned',
    topics: ['Partitions in practice', 'PACELC', 'Jepsen-style testing'],
  },
  {
    n: 7,
    title: 'Distributed transactions and NewSQL',
    short: 'Transactions and NewSQL',
    practical: 'Lab: Raft-replicated ranges',
    status: 'planned',
    topics: ['2PC and its failure modes', 'Consensus (Raft, Paxos)', 'Spanner, CockroachDB, YugabyteDB'],
  },
  {
    n: 8,
    title: 'Capstone: design a distributed inventory',
    short: 'Capstone',
    practical: 'Capstone project and peer review',
    status: 'planned',
    topics: ['Requirements to data model', 'Topology and failure plan', 'Defending the design'],
  },
]

// The six-step module anatomy (reference deck), extended with the How-to
// guide's apply / review / reflect steps.
export const STEPS = {
  begin: { label: 'Begin', icon: 'flag', tool: 'Page' },
  watch: { label: 'Watch', icon: 'play', tool: 'Lecture' },
  read: { label: 'Read', icon: 'book', tool: 'Book' },
  explore: { label: 'Explore', icon: 'diagram', tool: 'Interactive diagram' },
  experiment: { label: 'Experiment', icon: 'flask', tool: 'Lab' },
  check: { label: 'Check', icon: 'check-circle', tool: 'Quiz' },
  apply: { label: 'Apply', icon: 'upload', tool: 'Assignment' },
  review: { label: 'Review', icon: 'users', tool: 'Workshop' },
  discuss: { label: 'Discuss', icon: 'chat', tool: 'Forum' },
  reflect: { label: 'Reflect', icon: 'compass', tool: 'Page' },
}

// Module 1 activities, in the fixed order learners follow.
// completion: 'manual' => learner presses "Mark as done";
//             'auto'   => the activity marks itself when its criteria are met.
export const ACTIVITIES = [
  {
    id: 'start',
    step: 'begin',
    title: 'Start here: the corner shop problem',
    short: 'Start here',
    lead: 'A practical situation, what you will be able to do by the end, and a three-question warm-up.',
    minutes: 5,
    path: '/module/1/start',
    completion: 'auto',
    group: 'Begin',
  },
  {
    id: 'lecture-1',
    step: 'watch',
    title: 'Lecture 1.1 · The design problem',
    short: 'Lecture 1.1 · The design problem',
    lead: 'Which query matters most to the user? Three data models, one shelf of products.',
    minutes: 4,
    path: '/module/1/lecture/1',
    completion: 'manual',
    group: 'Learn',
  },
  {
    id: 'lecture-2',
    step: 'watch',
    title: 'Lecture 1.2 · Partitions, replicas and CAP',
    short: 'Lecture 1.2 · Partitions and CAP',
    lead: 'What happens when the shop opens in a second city and the network between them fails.',
    minutes: 4,
    path: '/module/1/lecture/2',
    completion: 'manual',
    group: 'Learn',
  },
  {
    id: 'reading',
    step: 'read',
    title: 'Reading · Models, costs and trade-offs',
    short: 'Reading · Models and trade-offs',
    lead: 'Eight short chapters with a worked example and the common mistakes.',
    minutes: 18,
    path: '/module/1/reading',
    completion: 'manual',
    group: 'Learn',
  },
  {
    id: 'explore',
    step: 'explore',
    title: 'Interactive diagram · Anatomy of a sharded cluster',
    short: 'Anatomy of a sharded cluster',
    lead: 'Follow one query from the client to the disk. Open every hotspot before the labs.',
    minutes: 6,
    path: '/module/1/explore',
    completion: 'manual',
    group: 'Learn',
  },
  {
    id: 'lab-shell',
    step: 'experiment',
    title: 'Lab 1 · Build the inventory',
    short: 'Lab 1 · Build the inventory',
    lead: 'insertMany, find stock below 5, updateOne to restock. Predict each result before you run it.',
    minutes: 15,
    path: '/module/1/lab/shell',
    completion: 'auto',
    group: 'Practise',
  },
  {
    id: 'lab-shard',
    step: 'experiment',
    title: 'Lab 2 · Map a shard key',
    short: 'Lab 2 · Map a shard key',
    lead: 'Try five shard keys on the same inventory and watch where writes and queries land.',
    minutes: 10,
    path: '/module/1/lab/shard',
    completion: 'auto',
    group: 'Practise',
  },
  {
    id: 'lab-replicas',
    step: 'experiment',
    title: 'Lab 3 · Replica lag and partitions',
    short: 'Lab 3 · Replica lag',
    lead: 'A three-node replica set across Riga, Tallinn and Vilnius. Add lag, cut the network, watch what breaks.',
    minutes: 12,
    path: '/module/1/lab/replicas',
    completion: 'auto',
    group: 'Practise',
  },
  {
    id: 'lab-quorum',
    step: 'experiment',
    title: 'Lab 4 · Quorums',
    short: 'Lab 4 · Quorums',
    lead: 'Tune N, W and R. Find the settings that guarantee you read the latest write.',
    minutes: 6,
    path: '/module/1/lab/quorum',
    completion: 'auto',
    group: 'Practise',
  },
  {
    id: 'lab-tx',
    step: 'experiment',
    title: 'Lab 5 · Two-phase commit and SQL transactions',
    short: 'Lab 5 · 2PC and SQL',
    lead: 'Run a cross-shard order, make a participant vote no, crash the coordinator. Compare with one SQL transaction.',
    minutes: 10,
    path: '/module/1/lab/transactions',
    completion: 'auto',
    group: 'Practise',
  },
  {
    id: 'quiz',
    step: 'check',
    title: 'Quiz 1 · Ten questions',
    short: 'Quiz 1 · Ten questions',
    lead: 'Drawn from a question bank, marked at once, with an explanation for every answer. Pass at 70%.',
    minutes: 12,
    path: '/module/1/quiz',
    completion: 'auto',
    group: 'Check',
  },
  {
    id: 'assignment',
    step: 'apply',
    title: 'Assignment · Run the finished database',
    short: 'Assignment · Run the database',
    lead: 'Deliver schema, query, result and a short trade-off justification.',
    minutes: 20,
    path: '/module/1/assignment',
    completion: 'auto',
    group: 'Apply',
  },
  {
    id: 'workshop',
    step: 'review',
    title: 'Workshop · Peer review',
    short: 'Workshop · Peer review',
    lead: 'Assess three submissions with the same rubric your own work is graded on.',
    minutes: 15,
    path: '/module/1/workshop',
    completion: 'auto',
    group: 'Apply',
  },
  {
    id: 'discussion',
    step: 'discuss',
    title: 'Discussion · Which query matters most?',
    short: 'Discussion',
    lead: 'One guided question that links the labs to a real system you know.',
    minutes: 10,
    path: '/module/1/discussion',
    completion: 'auto',
    group: 'Discuss',
  },
  {
    id: 'wrap-up',
    step: 'reflect',
    title: 'Wrap-up · Summary and reflection',
    short: 'Wrap-up',
    lead: 'The takeaways, a self-assessment against the outcomes, and two minutes of feedback.',
    minutes: 5,
    path: '/module/1/wrap-up',
    completion: 'auto',
    group: 'Reflect',
  },
]

export const ACTIVITY_GROUPS = ['Begin', 'Learn', 'Practise', 'Check', 'Apply', 'Discuss', 'Reflect']

// Stage gating. A stage opens only when every activity in all earlier stages is
// finished, or when the teacher opens it early (on their device, or by sharing
// the class code so students can enter it on theirs). Inside a stage the order
// is free. Change the codes before each run of the course.
export const STAGES = [
  {
    id: 'begin',
    title: 'Begin',
    lead: 'The situation and a warm-up.',
    activities: ['start'],
    code: null,
  },
  {
    id: 'learn',
    title: 'Learn',
    lead: 'Two lectures, the reading and the cluster diagram.',
    activities: ['lecture-1', 'lecture-2', 'reading', 'explore'],
    code: 'LEARN-24',
  },
  {
    id: 'practise',
    title: 'Practise',
    lead: 'Five browser labs.',
    activities: ['lab-shell', 'lab-shard', 'lab-replicas', 'lab-quorum', 'lab-tx'],
    code: 'LABS-57',
  },
  {
    id: 'apply',
    title: 'Check and apply',
    lead: 'Quiz, assignment, peer review and discussion.',
    activities: ['quiz', 'assignment', 'workshop', 'discussion'],
    code: 'APPLY-83',
  },
  {
    id: 'reflect',
    title: 'Reflect',
    lead: 'Summary, self-assessment and feedback.',
    activities: ['wrap-up'],
    code: 'WRAP-16',
  },
]

export const stageById = (id) => STAGES.find((s) => s.id === id)
export const stageOfActivity = (activityId) => STAGES.find((s) => s.activities.includes(activityId))

// What "finished" means for activities a learner marks done themselves.
export const COMPLETION_RULES = {
  'lecture-1': 'Watch at least 90% of the lecture',
  'lecture-2': 'Watch at least 90% of the lecture',
  reading: 'Open all eight chapters',
  explore: 'Open all nine hotspots',
}

export const activityById = (id) => ACTIVITIES.find((a) => a.id === id)
export const activityIndex = (id) => ACTIVITIES.findIndex((a) => a.id === id)
export const totalMinutes = ACTIVITIES.reduce((sum, a) => sum + a.minutes, 0)

// Lab checkpoints. Lab pages call setLabCheckpoint(lab, checkpointId).
// When every checkpoint of a lab is done, the store completes the lab
// activity and awards the lab badge.
export const LABS = {
  shell: {
    activity: 'lab-shell',
    badge: 'inventory-keeper',
    title: 'Build the inventory',
    checkpoints: [
      { id: 'insert', label: 'Insert the three products with insertMany' },
      { id: 'find-low', label: 'Find products with stock below 5' },
      { id: 'update', label: 'Restock Tea with updateOne and $inc' },
      { id: 'verify', label: 'Re-run the low-stock query and verify the change' },
      { id: 'index', label: 'Create an index on stock and read the explain plan' },
    ],
  },
  shard: {
    activity: 'lab-shard',
    badge: 'shard-cartographer',
    title: 'Map a shard key',
    checkpoints: [
      { id: 'compare', label: 'Try at least three different shard keys' },
      { id: 'hotspot', label: 'Create a hot shard with a monotonically increasing key' },
      { id: 'routing', label: 'Run one targeted and one scatter-gather query' },
      { id: 'choose', label: 'Choose a final shard key and justify it' },
    ],
  },
  replicas: {
    activity: 'lab-replicas',
    badge: 'partition-survivor',
    title: 'Replica lag and partitions',
    checkpoints: [
      { id: 'stale-read', label: 'Read stale data from a lagging secondary' },
      { id: 'majority', label: 'Write with w: "majority" and watch the acknowledgement wait' },
      { id: 'partition', label: 'Cut the network and watch the primary step down' },
      { id: 'rollback', label: 'Heal the network and see a w: 1 write rolled back' },
    ],
  },
  quorum: {
    activity: 'lab-quorum',
    badge: 'quorum-keeper',
    title: 'Quorums',
    checkpoints: [
      { id: 'overlap', label: 'Find a setting where R + W > N' },
      { id: 'stale', label: 'Get a stale read with R + W ≤ N' },
      { id: 'failure', label: 'Fail nodes until writes or reads become unavailable' },
    ],
  },
  tx: {
    activity: 'lab-tx',
    badge: 'coordinator',
    title: 'Two-phase commit and SQL',
    checkpoints: [
      { id: 'commit', label: 'Commit a cross-shard order with 2PC' },
      { id: 'abort', label: 'Make a participant vote NO and watch the abort' },
      { id: 'blocked', label: 'Crash the coordinator after PREPARE and see participants block' },
      { id: 'sql', label: 'Compare with a single-node SQL transaction' },
    ],
  },
}

export const LAB_KEYS = Object.keys(LABS)

export const BADGES = [
  { id: 'inventory-keeper', title: 'Inventory keeper', how: 'Finish Lab 1', icon: 'box' },
  { id: 'shard-cartographer', title: 'Shard cartographer', how: 'Finish Lab 2', icon: 'map' },
  { id: 'partition-survivor', title: 'Partition survivor', how: 'Finish Lab 3', icon: 'wifi-off' },
  { id: 'quorum-keeper', title: 'Quorum keeper', how: 'Finish Lab 4', icon: 'nodes' },
  { id: 'coordinator', title: 'Coordinator', how: 'Finish Lab 5', icon: 'handshake' },
  { id: 'quiz-pass', title: 'Sharp reader', how: 'Score 70% or more on Quiz 1', icon: 'target' },
  { id: 'peer-reviewer', title: 'Peer reviewer', how: 'Assess three peer submissions', icon: 'users' },
  { id: 'module-complete', title: 'Module 1 complete', how: 'Finish every Module 1 activity', icon: 'award' },
]

export const badgeById = (id) => BADGES.find((b) => b.id === id)

// The 90-minute class plan, one segment per slide of the lesson deck.
export const LESSON_PLAN = [
  {
    slide: 1,
    from: 0,
    to: 5,
    title: 'NoSQL, NewSQL and Distributed Architectures',
    focus: 'Set the outcome: explain the model, build a working example in a browser, defend trade-offs. Introduce the running inventory case.',
    ask: 'Who has had a shop app show an item in stock that was actually sold out?',
    predict: 'Students guess how many machines a national shop chain needs for its inventory.',
    verify: 'Reveal the running case and the deliverable for the end of the session.',
    activity: 'start',
  },
  {
    slide: 2,
    from: 5,
    to: 15,
    title: 'The design problem',
    focus: 'Key-value, document, column-family; workload-driven modelling; partitioning and replication; CAP; eventual consistency; 2PC cost; NewSQL goals.',
    ask: 'Which query or operation matters most to the user?',
    predict: 'Pairs rank three operations: show low stock, record a sale, monthly report.',
    verify: 'Play Lecture 1.1 to its embedded question and compare rankings.',
    activity: 'lecture-1',
  },
  {
    slide: 3,
    from: 15,
    to: 30,
    title: 'Model and representation',
    focus: 'Compare the three models on the same inventory. Test it on the running case.',
    ask: 'Where does "stock" live in each model, and what has to be read to find low stock?',
    predict: 'Students sketch the Tea product as key-value, document and column-family before the reveal.',
    verify: 'Open Reading chapter 2 and toggle the model switcher.',
    activity: 'reading',
  },
  {
    slide: 4,
    from: 30,
    to: 40,
    title: 'Identity and structure',
    focus: 'Architecture path: client operation, logical model, physical layout and index, result.',
    ask: 'What makes a document unique, and which machine owns it?',
    predict: 'Students trace a find on stock through the router to the shards.',
    verify: 'Walk the interactive cluster diagram hotspot by hotspot.',
    activity: 'explore',
  },
  {
    slide: 5,
    from: 40,
    to: 50,
    title: 'Operations and persistence',
    focus: 'The decision follows the workload. Discuss read, write, integrity and schema-change costs.',
    ask: 'Adding a "supplier" field: what does it cost in SQL, and in a document store?',
    predict: 'Each pair fills one cell of the cost table before discussion.',
    verify: 'Compare with Reading chapter 4.',
    activity: 'reading',
  },
  {
    slide: 6,
    from: 50,
    to: 60,
    title: 'Choosing the trade-off',
    focus: 'Environment: MongoDB playground and DB Fiddle. Sketch partition, replicas and quorum; compare a SQL transaction.',
    ask: 'If Riga and Tallinn lose contact, should Tallinn keep selling Tea?',
    predict: 'Vote: refuse writes (consistency) or accept them (availability).',
    verify: 'Run Lab 3, cut the network, and see what MongoDB actually does.',
    activity: 'lab-replicas',
  },
  {
    slide: 7,
    from: 60,
    to: 80,
    title: 'Build it in the browser',
    focus: 'Complete example from empty database to result: insertMany, find stock below 5, updateOne to restock.',
    ask: 'Which documents does find({stock: {$lt: 5}}) return?',
    predict: 'Students commit to a prediction in the lab before pressing Run.',
    verify: 'Run each step; then map a shard key in Lab 2.',
    activity: 'lab-shell',
  },
  {
    slide: 8,
    from: 80,
    to: 90,
    title: 'Run the finished database',
    focus: 'Deliver: schema or structure, query, result, and a short trade-off justification.',
    ask: 'Which single sentence best defends your shard key?',
    predict: 'Students score a sample submission with the rubric before writing their own.',
    verify: 'Submit the assignment; peer review opens.',
    activity: 'assignment',
  },
]
