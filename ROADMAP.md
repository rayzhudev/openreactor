# Roadmap

## Now

Launch the thinnest loop that allows OpenReactor to begin collecting work and start processing issues autonomously:

1. Public website with request form
2. Request validation and normalization
3. GitHub issue creation
4. Public queue view of recent requests
5. Local `reactor/` loop that claims issues and spawns agents

## Next

Once the intake loop and first reactor loop are stable:

1. Make accepted issues reliably create branches, commits, and PRs
2. Add PR follow-up and merge-state handling
3. Tighten prompts, plans, and quality gates based on live runs

## Later

Only after repeated live usage validates the workflow:

1. Add application-backed stored data features for the website/backend
2. Add persistent internal state beyond GitHub where it is actually needed
3. Add deployment status tracking and transparency metrics
