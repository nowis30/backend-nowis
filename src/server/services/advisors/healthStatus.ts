type AdvisorHealthConfig = {
  ADVISOR_ENGINE: string;
  OPENAI_API_KEY?: string;
  OPENAI_PROVIDER?: string;
};

/** Reports local configuration; it deliberately does not test provider connectivity. */
export function advisorHealthStatus(config: AdvisorHealthConfig) {
  return {
    engine: config.ADVISOR_ENGINE,
    check: 'configuration-only',
    openai: {
      configured: Boolean(config.OPENAI_API_KEY?.trim()),
      provider: config.OPENAI_PROVIDER === 'azure' ? 'azure' : 'openai'
    }
  };
}
