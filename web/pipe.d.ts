interface Slot {
    name: string;
    label?: string;
    type: string | number;
    link?: number | string | null;
    links?: (number | string)[] | null;
    color_on?: string;
    color_off?: string;
}
interface Link {
    id?: number | string;
    origin_id: number | string;
    origin_slot: number;
    target_id?: number | string;
    target_slot?: number;
    type?: string | number;
}
interface BoundarySlot extends Slot {
    localized_name?: string;
}
interface SubgraphOutputSlot extends BoundarySlot {
    getLinks(): Link[];
}
interface PipeGraph {
    groups?: {
        title: string;
        boundingRect: ArrayLike<number>;
    }[];
    rootGraph?: PipeGraph;
    subgraphs?: Map<string, PipeGraph>;
    inputNode?: {
        id: number | string;
        slots?: BoundarySlot[];
    };
    outputNode?: {
        slots: SubgraphOutputSlot[];
    };
    events?: {
        addEventListener(type: string, callback: () => void): void;
    };
    onAfterChange?: (...args: unknown[]) => unknown;
    _nodes: PipeNode[];
    links: Map<number | string, Link>;
    getNodeById(id: number | string): PipeNode | null;
    setDirtyCanvas(foreground: boolean, background: boolean): void;
}
interface PipeNode {
    id: number | string;
    type: string;
    mode?: number;
    properties?: Record<string, unknown>;
    graph?: PipeGraph;
    subgraph?: PipeGraph;
    inputs: Slot[];
    outputs: Slot[];
    size: [number, number];
    pos?: [number, number];
    boundingRect?: ArrayLike<number>;
    getInputLink(index: number): Link | null;
    isInputConnected?(index: number): boolean;
    isOutputConnected?(index: number): boolean;
    setOutputDataType?(index: number, type: Slot['type']): void;
    addInput(name: string, type: string): void;
    addOutput(name: string, type: string): void;
    removeInput(index: number): void;
    removeOutput(index: number): void;
    computeSize(): [number, number];
    setSize(size: [number, number]): void;
    onNodeCreated?: (...args: unknown[]) => unknown;
    onConfigure?: (...args: unknown[]) => unknown;
    onAdded?: (...args: unknown[]) => unknown;
    onRemoved?: (...args: unknown[]) => unknown;
    onConnectionsChange?: (...args: unknown[]) => unknown;
    onDrawForeground?: (...args: unknown[]) => unknown;
}
export declare const pipeCacheContext: (root: PipeGraph, executionId: string) => string;
export declare const preparePipeLayouts: (graph: PipeGraph) => void;
export {};
