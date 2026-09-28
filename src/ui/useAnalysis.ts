import { useMemo } from 'react';
import { analyse, type Analysis } from '../calc/analysis';
import { useProject } from '../store/project';

export function useAnalysis(): Analysis {
  const project = useProject((s) => s.project);
  return useMemo(() => analyse(project), [project]);
}
