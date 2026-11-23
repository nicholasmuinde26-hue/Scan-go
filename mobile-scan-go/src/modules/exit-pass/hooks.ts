import { useQuery } from '@tanstack/react-query'; import { exitPassApi } from './api';
export const useExitPass=(orderId:string)=>useQuery({queryKey:['exit-pass',orderId],queryFn:()=>exitPassApi.get(orderId),enabled:!!orderId,refetchInterval:25000});
