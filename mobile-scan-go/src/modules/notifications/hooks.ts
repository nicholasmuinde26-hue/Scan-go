import { useMutation } from '@tanstack/react-query'; import { notificationsApi } from './api';
export const useRegisterDevice=()=>useMutation({mutationFn:notificationsApi.registerDevice});
