import { createContext, useContext, useEffect } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { CorrectionKind } from './Corrections';

export interface ReplacementRequest {
  correctionId: number;
  kind: CorrectionKind;
  sourceId: number;
}
export const postingPages: Record<CorrectionKind,string> = {
  SALE:'sales', PURCHASE:'purchases', EXPENSE:'expenses', PAYMENT:'finance', LOSS:'stock',
};
export const postingPaths: Record<CorrectionKind,string> = {
  SALE:'/api/v1/sales', PURCHASE:'/api/v1/purchases', EXPENSE:'/api/v1/expenses',
  PAYMENT:'/api/v1/settlements', LOSS:'/api/v1/stock/losses',
};
export const ReplacementContext = createContext<{
  request: ReplacementRequest | null;
  cancel: () => void;
  complete: () => void;
}>({request:null,cancel:()=>{},complete:()=>{}});

export function useReplacementForm(kind: CorrectionKind,setOpen: Dispatch<SetStateAction<boolean>>) {
  const flow=useContext(ReplacementContext);
  useEffect(() => {
    if(flow.request?.kind===kind) setOpen(true);
  },[flow.request,kind,setOpen]);
  return () => {
    setOpen(false);
    if(flow.request?.kind===kind) flow.cancel();
  };
}

