/**
 * Onboarding management for GitHub DevWatch extension
 * Handles first-run experience and setup flow
 */

export class OnboardingManager {
    static STORAGE_KEY = 'onboarding_state';
    static STEPS = ['welcome', 'token', 'repos', 'categories', 'complete'];

    constructor() {
        this.state = null;
    }

    async getState() {
        if (!this.state) {
            const result = await chrome.storage.local.get([OnboardingManager.STORAGE_KEY]);
            this.state = result[OnboardingManager.STORAGE_KEY] || {
                currentStep: 0,
                completed: false,
                skippedSteps: [],
                data: {}
            };
        }
        return this.state;
    }

    async saveState(state) {
        this.state = state;
        await chrome.storage.local.set({
            [OnboardingManager.STORAGE_KEY]: state
        });
    }

    async isFirstRun() {
        const state = await this.getState();
        return !state.completed && state.currentStep === 0;
    }

    async isInOnboarding() {
        const state = await this.getState();
        return !state.completed;
    }

    async getCurrentStep() {
        const state = await this.getState();
        return OnboardingManager.STEPS[state.currentStep];
    }

    async nextStep() {
        const state = await this.getState();
        if (state.currentStep < OnboardingManager.STEPS.length - 1) {
            state.currentStep++;
            await this.saveState(state);
            return OnboardingManager.STEPS[state.currentStep];
        }
        return null;
    }

    async previousStep() {
        const state = await this.getState();
        if (state.currentStep > 0) {
            state.currentStep--;
            await this.saveState(state);
            return OnboardingManager.STEPS[state.currentStep];
        }
        return null;
    }

    async skipStep() {
        const state = await this.getState();
        const currentStepName = OnboardingManager.STEPS[state.currentStep];
        if (!state.skippedSteps.includes(currentStepName)) {
            state.skippedSteps.push(currentStepName);
        }

        if (state.currentStep < OnboardingManager.STEPS.length - 1) {
            state.currentStep++;
            await this.saveState(state);
            return OnboardingManager.STEPS[state.currentStep];
        }
        return null;
    }

    async completeOnboarding() {
        const state = await this.getState();
        state.completed = true;
        state.completedAt = Date.now();
        await this.saveState(state);
    }

    async restartOnboarding() {
        const state = {
            currentStep: 0,
            completed: false,
            skippedSteps: [],
            data: {}
        };
        await this.saveState(state);
    }

    async saveStepData(stepName, data) {
        const state = await this.getState();
        state.data[stepName] = data;
        await this.saveState(state);
    }

    async getStepData(stepName) {
        const state = await this.getState();
        return state.data[stepName] || {};
    }

    async getPopularRepos() {
        try {
            // Try to fetch trending repositories from GitHub API
            const response = await fetch('https://api.github.com/search/repositories?q=stars:>1000&sort=stars&order=desc&per_page=20', {
                headers: {
                    'Accept': 'application/vnd.github.v3+json',
                    'User-Agent': 'DevWatch-Chrome-Extension'
                }
            });

            if (!response.ok) {
                throw new Error('Failed to fetch trending repos');
            }

            const data = await response.json();
            const repos = data.items || [];

            // Filter to get 4 diverse repositories
            const filteredRepos = this.getFilteredRepos(repos);
            return filteredRepos.slice(0, 4);

        } catch (error) {
            console.warn('Failed to fetch trending repos, using fallback:', error);

            // Fallback to static popular repos
            return [
                { owner: 'microsoft', name: 'vscode', description: 'Visual Studio Code' },
                { owner: 'facebook', name: 'react', description: 'React JavaScript library' },
                { owner: 'torvalds', name: 'linux', description: 'Linux kernel' },
                { owner: 'nodejs', name: 'node', description: 'Node.js JavaScript runtime' }
            ];
        }
    }

    getFilteredRepos(repos) {
        // Filter out very large projects and aim for diversity
        const excludePatterns = [
            /github/i,  // GitHub itself
            /chromium/i, // Very large OS projects
            /android/i, // Very large OS projects
            /tensorflow/i, // Already in suggestions
            /pytorch/i, // Already in suggestions
        ];

        // Shuffle for variety and take first 4

        const filtered = repos.filter(repo => {
            const fullName = `${repo.owner.login}/${repo.name}`.toLowerCase();

            // Exclude by patterns
            if (excludePatterns.some(pattern => pattern.test(fullName))) {
                return false;
            }

            // Exclude extremely large projects (over 100k stars)
            if (repo.stargazers_count > 100000) {
                return false;
            }

            return true;
        });

        // Shuffle for variety and take first 4
        return this.shuffleArray(filtered);
    }

    shuffleArray(array) {
        const shuffled = [...array];
        for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
        return shuffled;
    }

    getGitHubTokenUrl() {
        return 'https://github.com/settings/tokens/new?scopes=repo,notifications&description=DevWatch%20Chrome%20Extension';
    }

    async getProgress() {
        const state = await this.getState();

        // Don't show progress on welcome step
        if (state.currentStep === 0) {
            return {
                current: 0,
                total: 1,
                percentage: 0,
                showProgress: false
            };
        }

        // Don't show progress on complete step either - it's not a step
        if (state.currentStep >= OnboardingManager.STEPS.length - 1) {
            return {
                current: 3,
                total: 3,
                percentage: 100,
                showProgress: false
            };
        }

        // Show progress for 3 actual steps: token (step 1), repos (step 2), categories (step 3)
        const progressSteps = 3; // Fixed to 3 steps
        const currentProgressStep = state.currentStep; // Welcome is 0, so currentStep is already correct

        return {
            current: currentProgressStep,
            total: progressSteps,
            percentage: Math.round((currentProgressStep / progressSteps) * 100),
            showProgress: true
        };
    }
}

export default OnboardingManager;