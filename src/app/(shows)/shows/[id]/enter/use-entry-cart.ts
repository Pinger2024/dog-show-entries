import { useReducer, useCallback } from 'react';

export type EntryType = 'standard' | 'junior_handler';

export interface CartEntry {
  id: string; // local client-side ID
  entryType: EntryType;
  dogId?: string;
  dogName?: string;
  breedName?: string;
  classIds: string[];
  classNames: string[]; // human-readable class names for cart review
  isNfc: boolean;
  totalFee: number;
  // Junior handler fields
  handlerName?: string;
  handlerDob?: string;
  handlerKcNumber?: string;
}

export type WizardStep =
  | 'entry_type'
  | 'select_dog'
  | 'junior_handler'
  | 'select_classes'
  | 'cart_review'
  | 'payment'
  | 'confirmation';

interface CartState {
  entries: CartEntry[];
  activeEntryId: string | null;
  step: WizardStep;
  editingExisting: boolean;
}

type CartAction =
  | { type: 'START_NEW_ENTRY' }
  | { type: 'SET_ENTRY_TYPE'; entryType: EntryType }
  | { type: 'SET_DOG'; dogId: string; dogName: string; breedName: string }
  | { type: 'SET_JH_DETAILS'; handlerName: string; handlerDob: string; handlerKcNumber?: string }
  | { type: 'SET_CLASSES'; classIds: string[]; classNames: string[]; totalFee: number; isNfc: boolean }
  | { type: 'EDIT_ENTRY'; entryId: string }
  | { type: 'REMOVE_ENTRY'; entryId: string }
  | { type: 'SET_STEP'; step: WizardStep }
  | { type: 'CHECKOUT_SUCCESS' }
  | { type: 'RESET' };

let nextId = 1;
function generateId(): string {
  return `cart-${nextId++}`;
}

function cartReducer(state: CartState, action: CartAction): CartState {
  switch (action.type) {
    case 'START_NEW_ENTRY': {
      const id = generateId();
      return {
        ...state,
        activeEntryId: id,
        editingExisting: false,
        step: 'entry_type',
        entries: [
          ...state.entries,
          {
            id,
            entryType: 'standard',
            classIds: [],
            classNames: [],
            isNfc: false,
            totalFee: 0,
          },
        ],
      };
    }

    case 'SET_ENTRY_TYPE': {
      return {
        ...state,
        entries: state.entries.map((e) =>
          e.id === state.activeEntryId
            ? { ...e, entryType: action.entryType }
            : e
        ),
        step: action.entryType === 'standard' ? 'select_dog' : 'junior_handler',
      };
    }

    case 'SET_DOG': {
      return {
        ...state,
        entries: state.entries.map((e) =>
          e.id === state.activeEntryId
            ? {
                ...e,
                dogId: action.dogId,
                dogName: action.dogName,
                breedName: action.breedName,
              }
            : e
        ),
        step: 'select_classes',
      };
    }

    case 'SET_JH_DETAILS': {
      return {
        ...state,
        entries: state.entries.map((e) =>
          e.id === state.activeEntryId
            ? {
                ...e,
                handlerName: action.handlerName,
                handlerDob: action.handlerDob,
                handlerKcNumber: action.handlerKcNumber,
              }
            : e
        ),
        step: 'select_classes',
      };
    }

    case 'SET_CLASSES': {
      return {
        ...state,
        entries: state.entries.map((e) =>
          e.id === state.activeEntryId
            ? {
                ...e,
                classIds: action.classIds,
                classNames: action.classNames,
                totalFee: action.totalFee,
                isNfc: action.isNfc,
              }
            : e
        ),
        step: 'cart_review',
      };
    }

    case 'EDIT_ENTRY': {
      const entry = state.entries.find((e) => e.id === action.entryId);
      if (!entry) return state;
      return {
        ...state,
        activeEntryId: action.entryId,
        editingExisting: true,
        step: 'select_classes',
      };
    }

    case 'REMOVE_ENTRY': {
      const remaining = state.entries.filter((e) => e.id !== action.entryId);
      return {
        ...state,
        entries: remaining,
        activeEntryId:
          state.activeEntryId === action.entryId ? null : state.activeEntryId,
        step: remaining.length === 0 ? 'entry_type' : 'cart_review',
      };
    }

    case 'SET_STEP': {
      return { ...state, step: action.step };
    }

    case 'CHECKOUT_SUCCESS': {
      return { ...state, step: 'confirmation' };
    }

    case 'RESET': {
      return initialState;
    }

    default:
      return state;
  }
}

const initialState: CartState = {
  entries: [],
  activeEntryId: null,
  step: 'entry_type',
  editingExisting: false,
};

export function useEntryCart() {
  const [state, dispatch] = useReducer(cartReducer, initialState);

  const activeEntry = state.entries.find(
    (e) => e.id === state.activeEntryId
  );

  const grandTotal = state.entries.reduce(
    (sum, e) => sum + e.totalFee,
    0
  );

  const startNewEntry = useCallback(() => dispatch({ type: 'START_NEW_ENTRY' }), []);
  const setEntryType = useCallback(
    (entryType: EntryType) => dispatch({ type: 'SET_ENTRY_TYPE', entryType }),
    []
  );
  const setDog = useCallback(
    (dogId: string, dogName: string, breedName: string) =>
      dispatch({ type: 'SET_DOG', dogId, dogName, breedName }),
    []
  );
  const setJHDetails = useCallback(
    (handlerName: string, handlerDob: string, handlerKcNumber?: string) =>
      dispatch({ type: 'SET_JH_DETAILS', handlerName, handlerDob, handlerKcNumber }),
    []
  );
  const setClasses = useCallback(
    (classIds: string[], classNames: string[], totalFee: number, isNfc: boolean) =>
      dispatch({ type: 'SET_CLASSES', classIds, classNames, totalFee, isNfc }),
    []
  );
  const editEntry = useCallback(
    (entryId: string) => dispatch({ type: 'EDIT_ENTRY', entryId }),
    []
  );
  const removeEntry = useCallback(
    (entryId: string) => dispatch({ type: 'REMOVE_ENTRY', entryId }),
    []
  );
  const setStep = useCallback(
    (step: WizardStep) => dispatch({ type: 'SET_STEP', step }),
    []
  );
  const checkoutSuccess = useCallback(
    () => dispatch({ type: 'CHECKOUT_SUCCESS' }),
    []
  );
  const reset = useCallback(() => dispatch({ type: 'RESET' }), []);

  return {
    ...state,
    activeEntry,
    grandTotal,
    startNewEntry,
    setEntryType,
    setDog,
    setJHDetails,
    setClasses,
    editEntry,
    removeEntry,
    setStep,
    checkoutSuccess,
    reset,
  };
}
