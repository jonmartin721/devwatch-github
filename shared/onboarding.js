/**
 * Onboarding management for GitHub DevWatch extension
 * Handles first-run experience and setup flow
 */

import { getAccessToken } from './storage-helpers.js';
import { createHeaders } from './github-api.js';

const CURATED_POPULAR_REPOS = [
    {
        owner: { login: 'microsoft' },
        name: 'vscode',
        description: 'Visual Studio Code - lightweight but powerful source code editor',
        language: 'TypeScript',
        stargazers_count: 150000
    },
    {
        owner: { login: 'facebook' },
        name: 'react',
        description: 'A declarative, efficient, and flexible JavaScript library for building user interfaces',
        language: 'JavaScript',
        stargazers_count: 220000
    },
    {
        owner: { login: 'vercel' },
        name: 'next.js',
        description: 'The React framework for the web',
        language: 'TypeScript',
        stargazers_count: 130000
    },
    {
        owner: { login: 'microsoft' },
        name: 'TypeScript',
        description: 'TypeScript is a superset of JavaScript that compiles to clean JavaScript output',
        language: 'TypeScript',
        stargazers_count: 100000
    },
    {
        owner: { login: 'home-assistant' },
        name: 'core',
        description: 'Open source home automation that puts local control and privacy first',
        language: 'Python',
        stargazers_count: 80000
    },
    {
        owner: { login: 'supabase' },
        name: 'supabase',
        description: 'The open source Firebase alternative',
        language: 'TypeScript',
        stargazers_count: 90000
    }
];

const POPULAR_REPO_BLOCKLIST = [
    /(^|\/)awesome([-/]|$)/i,
    /roadmap/i,
    /interview/i,
    /\bbook(s)?\b/i,
    /primer/i,
    /curriculum/i,
    /collection/i,
    /resources/i,
    /system[\s-]?design/i,
    /free[-\s]?programming/i,
    /developer[-\s]?roadmap/i,
    /build[-\s]?your[-\s]?own/i
];

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
        // Read the latest onboarding state from storage to avoid stale
        // data that might be cached in a different OnboardingManager
        // instance (e.g., different modules or test instances).
        const result = await chrome.storage.local.get([OnboardingManager.STORAGE_KEY]);
        const stored = result[OnboardingManager.STORAGE_KEY] || null;

        if (stored && stored.data && stored.data[stepName] !== undefined) {
            return stored.data[stepName];
        }

        // Fallback to in-memory state
        const state = await this.getState();
        return state.data[stepName] || {};
    }

    async getPopularRepos() {
        try {
            // Try to fetch trending repositories from GitHub API using the
            // current authenticated session when it is available.
            const storedToken = await getAccessToken();
            const headers = storedToken
                ? createHeaders(storedToken)
                : { 'Accept': 'application/vnd.github.v3+json' };
            const recentCutoff = new Date();
            recentCutoff.setFullYear(recentCutoff.getFullYear() - 1);
            const recentCutoffDate = recentCutoff.toISOString().slice(0, 10);
            const apiUrl = `https://api.github.com/search/repositories?q=${encodeURIComponent(`stars:>15000 archived:false fork:false is:public pushed:>${recentCutoffDate}`)}&sort=stars&order=desc&per_page=24`;

            let response;
            let retryCount = 0;
            const maxRetries = 3;
            const baseDelay = 1000; // 1 second

            while (retryCount < maxRetries) {
                try {
                    // Add timeout with AbortSignal if available (modern browsers)
                    const controller = typeof AbortSignal.timeout === 'function'
                        ? new AbortController() // Fallback for older environments
                        : new AbortController();

                    // Set timeout for older browsers manually
                    let timeoutId;
                    if (typeof AbortSignal.timeout !== 'function') {
                        timeoutId = setTimeout(() => controller.abort(), 10000);
                    }

                    try {
                        response = await fetch(apiUrl, {
                            headers,
                            signal: typeof AbortSignal.timeout === 'function'
                                ? AbortSignal.timeout(10000) // 10 second timeout
                                : controller.signal
                        });
                    } finally {
                        if (timeoutId) {
                            clearTimeout(timeoutId);
                        }
                    }

                    // Check if we got a successful response
                    if (response && response.ok) {
                        break; // Success, exit retry loop
                    }

                    // Handle errors with the response
                    if (response) {

                        // Handle rate limiting (403)
                        if (response.status === 403) {
                            const rateLimitReset = response.headers.get('X-RateLimit-Reset');
                            if (rateLimitReset) {
                                const resetTime = parseInt(rateLimitReset) * 1000;
                                const currentTime = Date.now();
                                const waitTime = Math.max(0, resetTime - currentTime);

                                if (waitTime < 30000) { // Only wait if less than 30 seconds
                                    await new Promise(resolve => setTimeout(resolve, waitTime));
                                    retryCount++;
                                    continue;
                                }
                            }
                        }

                        // For other HTTP errors, continue to retry
                        // Retry logic for HTTP errors
                        if (retryCount < maxRetries - 1) {
                            const delay = baseDelay * Math.pow(2, retryCount);
                            await new Promise(resolve => setTimeout(resolve, delay));
                            retryCount++;
                            continue;
                        }

                        // Last retry failed for HTTP errors
                        throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
                    }

                    // If we have no response (fetch failed), retry logic is in catch block
                    if (!response && retryCount < maxRetries - 1) {
                        const delay = baseDelay * Math.pow(2, retryCount);
                        await new Promise(resolve => setTimeout(resolve, delay));
                        retryCount++;
                        continue;
                    }

                    if (!response) {
                        throw new Error('Failed to fetch repositories - no response received');
                    }

                } catch (fetchError) {
                    if (retryCount < maxRetries - 1) {
                        const delay = baseDelay * Math.pow(2, retryCount);
                        await new Promise(resolve => setTimeout(resolve, delay));
                        retryCount++;
                        continue;
                    }

                    // Last retry failed, re-throw the error
                    throw fetchError;
                }
            }

            if (!response.ok) {
                throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
            }

            const data = await response.json();
            const repos = data.items || [];

            const filteredRepos = this.getFilteredRepos(repos);
            const finalRepos = this.withCuratedBackfill(filteredRepos).slice(0, 3);

            return finalRepos;

        } catch (_error) {
            return CURATED_POPULAR_REPOS.slice(0, 3);
        }
    }

    getFilteredRepos(repos) {
        const seenRepos = new Set();

        return (Array.isArray(repos) ? repos : []).filter((repo) => {
            const owner = repo?.owner?.login || '';
            const name = repo?.name || '';
            const fullName = `${owner}/${name}`.trim();
            const normalizedFullName = fullName.toLowerCase();
            const haystack = `${normalizedFullName} ${repo?.description || ''}`.toLowerCase();
            const language = String(repo?.language || '').trim();

            if (!owner || !name || seenRepos.has(normalizedFullName)) {
                return false;
            }

            if (!language || language.toLowerCase() === 'markdown') {
                return false;
            }

            if (POPULAR_REPO_BLOCKLIST.some(pattern => pattern.test(haystack))) {
                return false;
            }

            seenRepos.add(normalizedFullName);
            return true;
        });
    }

    withCuratedBackfill(repos) {
        const uniqueRepos = [];
        const seenRepos = new Set();

        [...(Array.isArray(repos) ? repos : []), ...CURATED_POPULAR_REPOS].forEach((repo) => {
            const owner = repo?.owner?.login || '';
            const name = repo?.name || '';
            const fullName = `${owner}/${name}`.trim().toLowerCase();

            if (!fullName || seenRepos.has(fullName)) {
                return;
            }

            seenRepos.add(fullName);
            uniqueRepos.push(repo);
        });

        return uniqueRepos;
    }

    shuffleArray(array) {
        const shuffled = [...array];
        for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
        return shuffled;
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
