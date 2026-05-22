// NEAT (NeuroEvolution of Augmenting Topologies) Implementation
// Исправленная версия: добавлены acceptsIncomingConnections в BiasNode и прочие фиксы

// ===== CORE CLASSES =====

class NodeGene {
  constructor(id, config) {
    this.id = id;
    this.config = config;
    this.lastOutput = 0;
    this.expectedInputs = 0;
    this.receivedInputs = 0;
    this.outgoingConnections = [];
    this.incomingConnections = [];
  }

  resetState() {
    this.lastOutput = 0;
    this.expectedInputs = 0;
    this.receivedInputs = 0;
  }

  addOutgoingConnection(connection) {
    this.outgoingConnections.push(connection);
  }

  addIncomingConnection(connection) {
    this.incomingConnections.push(connection);
  }
}

class StaticManager {
  static genomeTrackers = new Map();
  static nodeTrackers = new Map();
  static innovationTrackers = new Map();

  static getGenomeTracker(populationId) {
    if (!this.genomeTrackers.has(populationId)) {
      this.genomeTrackers.set(populationId, new GenomeTracker());
    }
    return this.genomeTrackers.get(populationId);
  }

  static getNodeTracker(populationId) {
    if (!this.nodeTrackers.has(populationId)) {
      this.nodeTrackers.set(populationId, new NodeTracker());
    }
    return this.nodeTrackers.get(populationId);
  }

  static getInnovationTracker(populationId) {
    if (!this.innovationTrackers.has(populationId)) {
      this.innovationTrackers.set(populationId, new InnovationTracker(this.getNodeTracker(populationId)));
    }
    return this.innovationTrackers.get(populationId);
  }
}

class GenomeTracker {
  constructor() {
    this.currentId = 0;
  }

  getNextGenomeId() {
    return this.currentId++;
  }
}

class NodeTracker {
  constructor() {
    this.currentId = 0;
  }

  getNextNodeId() {
    return this.currentId++;
  }
}

class InnovationTracker {
  constructor(nodeTracker) {
    this.innovations = new Map();
    this.nodeInnovations = new Map();
    this.currentInnovation = 0;
    this.nodeTracker = nodeTracker;
  }

  getNextInnovationNumber() {
    return this.currentInnovation++;
  }

  trackInnovation(inNodeId, outNodeId) {
    const key = `${inNodeId}:${outNodeId}`;
    if (this.innovations.has(key)) {
      return { innovationNumber: this.innovations.get(key) };
    }
    const innovationNumber = this.getNextInnovationNumber();
    this.innovations.set(key, innovationNumber);
    return { innovationNumber };
  }

  trackAddNodeInnovation(connToSplit) {
    const key = `${connToSplit.inNode.id}:${connToSplit.outNode.id}`;
    if (this.nodeInnovations.has(key)) {
      return this.nodeInnovations.get(key);
    }
    const newNodeId = this.nodeTracker.getNextNodeId();
    const inToNew = this.trackInnovation(connToSplit.inNode.id, newNodeId);
    const newToOut = this.trackInnovation(newNodeId, connToSplit.outNode.id);
    const result = { newNodeId, inToNew, newToOut };
    this.nodeInnovations.set(key, result);
    return result;
  }
}

class InputNode extends NodeGene {
  constructor(id, config) {
    super(id, config);
    this.nodeType = NodeType.INPUT;
    this.outgoingConnections = [];
  }

  feedInput(input) {
    this.lastOutput = input;
    for (const connection of this.outgoingConnections) {
      connection.feedForward(input);
    }
  }

  acceptsOutgoingConnections() {
    return true;
  }

  acceptsIncomingConnections() {
    return false;
  }
}

class HiddenNode extends NodeGene {
  constructor(id, config) {
    super(id, config);
    this.nodeType = NodeType.HIDDEN;
    this.activationFunction = config.activationFunction;
    this.incomingConnections = [];
    this.outgoingConnections = [];
    this.incomingRecurrentConnections = [];
    this.biasConnection = null;
    this.inputs = [];
  }

  feedInput(input) {
    this.inputs.push(input);
    this.receivedInputs++;
    if (this.receivedInputs === this.expectedInputs) {
      this.activate();
    }
  }

  activate() {
    let sum = this.inputs.reduce((acc, input) => acc + input, 0);
    
    // Add recurrent connections
    for (const conn of this.incomingRecurrentConnections) {
      if (conn.enabled) {
        sum += conn.inNode.lastOutput * conn.weight;
      }
    }

    // Add bias
    switch (this.config.biasMode) {
      case 'WEIGHTED_NODE':
        if (this.biasConnection?.enabled) {
          sum += this.biasConnection.weight * this.biasConnection.inNode.bias;
        }
        break;
      case 'DIRECT_NODE':
        if (this.biasConnection?.enabled) {
          sum += this.biasConnection.inNode.bias;
        }
        break;
      case 'CONSTANT':
        sum += this.config.bias;
        break;
    }

    this.lastOutput = this.activationFunction.apply(sum);
    
    // Propagate to outgoing connections
    for (const conn of this.outgoingConnections) {
      conn.feedForward(this.lastOutput);
    }

    this.inputs = [];
    this.receivedInputs = 0;
  }

  addIncomingConnection(connection) {
    if (connection.recurrent) {
      this.incomingRecurrentConnections.push(connection);
    } else {
      this.incomingConnections.push(connection);
    }
  }

  acceptsIncomingConnections() {
    return true;
  }

  acceptsOutgoingConnections() {
    return true;
  }
}

class OutputNode extends NodeGene {
  constructor(id, config) {
    super(id, config);
    this.nodeType = NodeType.OUTPUT;
    this.activationFunction = config.activationFunction;
    this.incomingConnections = [];
    this.incomingRecurrentConnections = [];
    this.biasConnection = null;
    this.inputs = [];
  }

  feedInput(input) {
    this.inputs.push(input);
    this.receivedInputs++;
    if (this.receivedInputs === this.expectedInputs) {
      this.activate();
    }
  }

  activate() {
    let sum = this.inputs.reduce((acc, input) => acc + input, 0);
    
    for (const conn of this.incomingRecurrentConnections) {
      if (conn.enabled) {
        sum += conn.inNode.lastOutput * conn.weight;
      }
    }

    switch (this.config.biasMode) {
      case 'WEIGHTED_NODE':
        if (this.biasConnection?.enabled) {
          sum += this.biasConnection.weight * this.biasConnection.inNode.bias;
        }
        break;
      case 'DIRECT_NODE':
        if (this.biasConnection?.enabled) {
          sum += this.biasConnection.inNode.bias;
        }
        break;
      case 'CONSTANT':
        sum += this.config.bias;
        break;
    }

    this.lastOutput = this.activationFunction.apply(sum);
    this.inputs = [];
    this.receivedInputs = 0;
  }

  addIncomingConnection(connection) {
    if (connection.recurrent) {
      this.incomingRecurrentConnections.push(connection);
    } else {
      this.incomingConnections.push(connection);
    }
  }

  acceptsIncomingConnections() {
    return true;
  }

  acceptsOutgoingConnections() {
    return false;
  }
}

class BiasNode extends NodeGene {
  constructor(id, config) {
    super(id, config);
    this.nodeType = NodeType.BIAS;
    this.bias = config.bias;
    this.lastOutput = this.bias;
    this.outgoingConnections = [];
  }

  feedInput() {
    this.lastOutput = this.bias;
    for (const connection of this.outgoingConnections) {
      connection.feedForward(this.lastOutput);
    }
  }

  resetState() {
    this.expectedInputs = 0;
    this.receivedInputs = 0;
    this.lastOutput = this.bias;
  }

  acceptsOutgoingConnections() {
    return true;
  }

  // ВАЖНОЕ ИСПРАВЛЕНИЕ: запрещаем входящие соединения для узла смещения
  acceptsIncomingConnections() {
    return false;
  }
}

class ConnectionGene {
  constructor(inNode, outNode, weight, enabled, innovationNumber, recurrent, config) {
    this.inNode = inNode;
    this.outNode = outNode;
    this.weight = weight;
    this.enabled = enabled;
    this.innovationNumber = innovationNumber;
    this.recurrent = recurrent;
    this.config = config;
    this.forwardedExpectedInput = false;

    inNode.addOutgoingConnection(this);
    outNode.addIncomingConnection(this);  // correctly dispatches recurrent/normal
  }

  feedForward(input) {
    if (this.enabled && !this.recurrent) {
      this.outNode.feedInput(input * this.weight);
    }
  }

  forwardExpectedInput() {
    if (!this.forwardedExpectedInput) {
      if (this.outNode instanceof HiddenNode || this.outNode instanceof OutputNode) {
        this.outNode.forwardExpectedInput();
      }
      this.forwardedExpectedInput = true;
    }
  }

  reinitializeWeight() {
    this.weight = this.config.weightInitialization.initializeWeight();
  }
}

// ===== ACTIVATION FUNCTIONS =====
class ActivationFunction {
  apply(x) {
    throw new Error('Must be implemented by subclass');
  }
}

class Sigmoid extends ActivationFunction {
  apply(x) {
    return 1 / (1 + Math.exp(-x));
  }
}

class Tanh extends ActivationFunction {
  apply(x) {
    return Math.tanh(x);
  }
}

class ReLU extends ActivationFunction {
  apply(x) {
    return Math.max(0, x);
  }
}

class NEATSigmoid extends ActivationFunction {
  constructor(steepness = 4.9) {
    super();
    this.steepness = steepness;
  }

  apply(x) {
    return 1 / (1 + Math.exp(-this.steepness * x));
  }
}

// ===== GENOME =====
class Genome {
  constructor(nodeGenes, connectionGenes, config, populationId) {
    this.nodeGenes = nodeGenes;
    this.connectionGenes = connectionGenes;
    this.inputNodes = nodeGenes.filter(node => node instanceof InputNode);
    this.outputNodes = nodeGenes.filter(node => node instanceof OutputNode);
    this.biasNode = nodeGenes.find(node => node instanceof BiasNode) || null;
    this.config = config;
    this.genomeTracker = StaticManager.getGenomeTracker(populationId);
    this.nodeTracker = StaticManager.getNodeTracker(populationId);
    this.innovationTracker = StaticManager.getInnovationTracker(populationId);
    this.id = this.genomeTracker.getNextGenomeId();
    this.fitness = 0;
    this.adjustedFitness = 0;
    this.populationId = populationId;
  }

  propagate(inputs) {
    this.resetState();
    this.calculateExpectedInputs();

    // Feed inputs to input nodes
    for (let i = 0; i < inputs.length; i++) {
      const node = this.inputNodes[i];
      if (node) node.feedInput(inputs[i]);
    }

    // Feed bias node if present
    if (this.biasNode) {
      this.biasNode.feedInput(this.biasNode.lastOutput);
    }

    // Collect outputs
    const outputs = [];
    for (let i = 0; i < this.outputNodes.length; i++) {
      outputs[i] = this.outputNodes[i].lastOutput;
    }

    return outputs;
  }

  resetState() {
    for (const node of this.nodeGenes) {
      node.resetState();
    }
  }

  calculateExpectedInputs() {
    for (const node of this.nodeGenes) {
      node.expectedInputs = 0;
      node.receivedInputs = 0;
    }

    for (const conn of this.connectionGenes) {
      conn.forwardedExpectedInput = false;
      if (conn.enabled && !conn.recurrent) {
        conn.outNode.expectedInputs += 1;
      }
    }
  }

  getNodeById(id) {
    return this.nodeGenes.find(node => node.id === id) || null;
  }

  // Проверка рекуррентности (поиск цикла)
  checkIfRecurrent(inNode, outNode) {
    const visited = new Set();
    const queue = [outNode];
    while (queue.length > 0) {
      const current = queue.shift();
      if (current === inNode) return true;
      if (visited.has(current.id)) continue;
      visited.add(current.id);
      for (const conn of this.connectionGenes) {
        if (conn.inNode === current && conn.enabled) {
          queue.push(conn.outNode);
        }
      }
    }
    return false;
  }

  mutate() {
    if (Math.random() < this.config.weightMutationRate) {
      this.mutateWeights();
    }
    if (Math.random() < this.config.addConnectionMutationRate) {
      this.mutateAddConnection();
    }
    if (Math.random() < this.config.addNodeMutationRate) {
      this.mutateAddNode();
    }
  }

  mutateWeights() {
    const { minWeight, maxWeight, reinitializeWeightRate, minPerturb, maxPerturb } = this.config;
    
    for (const conn of this.connectionGenes) {
      if (Math.random() < reinitializeWeightRate) {
        conn.reinitializeWeight();
      } else {
        const perturbation = minPerturb + (maxPerturb - minPerturb) * Math.random();
        let newWeight = conn.weight + perturbation;
        conn.weight = Math.max(minWeight, Math.min(maxWeight, newWeight));
      }
    }
  }

  mutateAddConnection() {
    for (let attempts = 0; attempts < 100; attempts++) {
      const inNode = this.nodeGenes[Math.floor(Math.random() * this.nodeGenes.length)];
      const outNode = this.nodeGenes[Math.floor(Math.random() * this.nodeGenes.length)];

      if (!inNode.acceptsOutgoingConnections() || !outNode.acceptsIncomingConnections()) {
        continue;
      }

      // Проверка на существующее соединение
      const existing = this.connectionGenes.find(
        conn => conn.inNode === inNode && conn.outNode === outNode
      );
      if (existing) continue;

      const isRecurrent = this.checkIfRecurrent(inNode, outNode);
      if (isRecurrent && (!this.config.allowRecurrentConnections || 
          Math.random() > this.config.recurrentConnectionRate)) {
        continue;
      }

      const innovation = this.innovationTracker.trackInnovation(inNode.id, outNode.id);
      const newConn = new ConnectionGene(
        inNode, outNode,
        this.config.weightInitialization.initializeWeight(),
        true, innovation.innovationNumber, isRecurrent, this.config
      );
      this.connectionGenes.push(newConn);
      return;
    }
  }

  mutateAddNode() {
    const enabledConnections = this.connectionGenes.filter(conn => conn.enabled);
    if (enabledConnections.length === 0) return;

    const connToSplit = enabledConnections[Math.floor(Math.random() * enabledConnections.length)];
    connToSplit.enabled = false;

    const innovation = this.innovationTracker.trackAddNodeInnovation(connToSplit);
    const newNode = new HiddenNode(innovation.newNodeId, this.config);
    this.nodeGenes.push(newNode);

    const conn1 = new ConnectionGene(
      connToSplit.inNode, newNode, 1, true,
      innovation.inToNew.innovationNumber, false, this.config
    );
    const conn2 = new ConnectionGene(
      newNode, connToSplit.outNode, connToSplit.weight, true,
      innovation.newToOut.innovationNumber, connToSplit.recurrent, this.config
    );

    this.connectionGenes.push(conn1, conn2);
  }

  copy() {
    const nodeMap = new Map();
    const newNodes = [];
    const newConnections = [];

    // Copy nodes
    for (const node of this.nodeGenes) {
      let newNode;
      if (node instanceof InputNode) newNode = new InputNode(node.id, this.config);
      else if (node instanceof HiddenNode) newNode = new HiddenNode(node.id, this.config);
      else if (node instanceof OutputNode) newNode = new OutputNode(node.id, this.config);
      else if (node instanceof BiasNode) newNode = new BiasNode(node.id, this.config);
      
      if (newNode) {
        newNodes.push(newNode);
        nodeMap.set(node.id, newNode);
      }
    }

    // Copy connections
    for (const conn of this.connectionGenes) {
      const newInNode = nodeMap.get(conn.inNode.id);
      const newOutNode = nodeMap.get(conn.outNode.id);
      if (newInNode && newOutNode) {
        const newConn = new ConnectionGene(
          newInNode, newOutNode, conn.weight, conn.enabled,
          conn.innovationNumber, conn.recurrent, this.config
        );
        newConnections.push(newConn);
      }
    }

    return new Genome(newNodes, newConnections, this.config, this.populationId);
  }
}

// ===== FITNESS FUNCTION =====
class XORFitnessFunction {
  calculateFitness(genome) {
    const inputs = [[0,0], [0,1], [1,0], [1,1]];
    const expected = [0, 1, 1, 0];
    let error = 0;

    for (let i = 0; i < inputs.length; i++) {
      const output = genome.propagate(inputs[i]);
      error += Math.pow(output[0] - expected[i], 2);
    }

    return 1 / (1 + error);
  }
}

// ===== POPULATION =====
class Population {
  constructor(config) {
    this.config = config;
    this.genomes = [];
    this.generation = 0;
    this.populationId = 0; // simplified
    this.createInitialPopulation();
  }

  createInitialPopulation() {
    // Создаём геномы с полносвязной начальной топологией
    for (let i = 0; i < this.config.populationSize; i++) {
      const { nodes, connections } = this.createMinimalGenome();
      const genome = new Genome(nodes, connections, this.config, this.populationId);
      this.genomes.push(genome);
    }
  }

  createMinimalGenome() {
    const inputNodes = [];
    for (let i = 0; i < this.config.inputSize; i++) {
      inputNodes.push(new InputNode(i, this.config));
    }
    const outputNodes = [];
    for (let i = 0; i < this.config.outputSize; i++) {
      outputNodes.push(new OutputNode(i + this.config.inputSize, this.config));
    }
    const biasNode = new BiasNode(this.config.inputSize + this.config.outputSize, this.config);
    const nodes = [...inputNodes, ...outputNodes, biasNode];

    // Соединяем каждый вход и bias с каждым выходом
    const connections = [];
    const innovationTracker = StaticManager.getInnovationTracker(this.populationId);
    const weightInit = this.config.weightInitialization.initializeWeight;

    for (const input of inputNodes) {
      for (const output of outputNodes) {
        const innov = innovationTracker.trackInnovation(input.id, output.id);
        connections.push(new ConnectionGene(
          input, output, weightInit(), true, innov.innovationNumber, false, this.config
        ));
      }
    }
    for (const output of outputNodes) {
      const innov = innovationTracker.trackInnovation(biasNode.id, output.id);
      connections.push(new ConnectionGene(
        biasNode, output, weightInit(), true, innov.innovationNumber, false, this.config
      ));
    }

    return { nodes, connections };
  }

  evaluatePopulation() {
    for (const genome of this.genomes) {
      genome.fitness = this.config.fitnessFunction.calculateFitness(genome);
    }
  }

  speciate() {
    // simplified speciation
    for (const genome of this.genomes) {
      genome.adjustedFitness = genome.fitness / 1; // no speciation
    }
  }

  evolve() {
    this.generation++;
    this.speciate();
    this.genomes.sort((a, b) => b.adjustedFitness - a.adjustedFitness);
    const newGenomes = [];
    const eliteCount = Math.floor(this.config.populationSize * 0.1);
    for (let i = 0; i < eliteCount; i++) {
      newGenomes.push(this.genomes[i].copy());
    }
    while (newGenomes.length < this.config.populationSize) {
      const parent1 = this.genomes[Math.floor(Math.random() * this.config.populationSize)];
      const parent2 = this.genomes[Math.floor(Math.random() * this.config.populationSize)];
      const child = parent1.copy();
      child.mutate();
      newGenomes.push(child);
    }
    this.genomes = newGenomes;
  }

  getBestGenome() {
    return this.genomes.reduce((best, genome) => genome.fitness > best.fitness ? genome : best);
  }
}

// ===== CONFIGURATION =====
class Config {
  constructor(options = {}) {
    const defaults = {
      inputSize: 2,
      outputSize: 1,
      activationFunction: new Sigmoid(),
      bias: 1,
      connectBias: true,
      biasMode: 'WEIGHTED_NODE',
      allowRecurrentConnections: true,
      recurrentConnectionRate: 1,
      populationSize: 150,
      generations: 100,
      targetFitness: 0.95,
      survivalRate: 0.2,
      numOfElite: 10,
      mutationRate: 1,
      weightMutationRate: 0.8,
      addConnectionMutationRate: 0.05,
      addNodeMutationRate: 0.03,
      minWeight: -5,
      maxWeight: 5,
      reinitializeWeightRate: 0.1,
      minPerturb: -0.5,
      maxPerturb: 0.5,
      weightInitialization: {
        initializeWeight: () => (Math.random() * 2 - 1)
      },
      fitnessFunction: new XORFitnessFunction()
    };

    Object.assign(this, defaults, options);
  }
}

// ===== MAIN API =====
class NEAT {
  constructor(config) {
    this.config = new Config(config);
    this.population = new Population(this.config);
  }

  run() {
    this.population.evaluatePopulation();
    
    for (let generation = 0; generation < this.config.generations; generation++) {
      this.population.evolve();
      this.population.evaluatePopulation();
      
      const bestFitness = this.population.getBestGenome().fitness;
      console.log(`Generation ${this.population.generation}: Best fitness = ${bestFitness.toFixed(4)}`);
      
      if (bestFitness >= this.config.targetFitness) {
        console.log('Target fitness reached!');
        break;
      }
    }
    
    return this.population.getBestGenome();
  }
}

// NodeType enum
const NodeType = {
  INPUT: 'INPUT',
  HIDDEN: 'HIDDEN',
  OUTPUT: 'OUTPUT',
  BIAS: 'BIAS'
};

// Export to global scope for browser usage
window.NEATJavaScript = {
  Config,
  Population,
  Genome,
  NodeGene,
  ConnectionGene,
  ActivationFunction,
  Sigmoid,
  Tanh,
  ReLU,
  NEATSigmoid,
  XORFitnessFunction,
  NEAT
};