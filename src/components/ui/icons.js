/**
 * Every icon the page uses, in one place.
 *
 * These were previously deep imported from lucide-react/dist/esm/icons/*.mjs to
 * shrink the bundle. Measured: the deep and barrel builds are the same size to
 * within one byte, because rollup tree-shakes the barrel. lucide-react@1 ships
 * no exports map, so those paths were unsupported internals that any patch
 * release could move. Reverted to the public API.
 */

export { CircleAlert as AlertIcon, ArrowLeft as ArrowLeft, ArrowRight as ArrowRight, Check as Check, CircleCheck as CheckCircle, Clock as Clock, Copy as Copy, ExternalLink as ExternalLink, House as Home, LoaderCircle as Loader, ShieldCheck as ShieldCheck } from "lucide-react";
